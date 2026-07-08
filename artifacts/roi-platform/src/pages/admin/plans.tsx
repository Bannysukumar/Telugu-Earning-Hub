import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetPlans,
  useAdminDeletePlan,
  useAdminGetLevelIncome,
  useAdminGetSettings,
  adminCreatePlan,
  adminUpdatePlan,
  getAdminGetPlansQueryKey,
  type Plan,
  type LevelIncomeTier,
} from "@workspace/api-client-react";
import { Card, Button, Modal, Input, Label, Badge } from "@/components/ui/core";
import { Switch } from "@/components/ui/switch";
import { formatINR } from "@/lib/utils";
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { usePlatformFeatures } from "@/hooks/use-platform-features";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

type PlanKind = "mlm" | "standalone";
type PlanWithKind = Plan & { planKind?: PlanKind; levelIncomeTiers?: LevelIncomeTier[] };

type LevelTierRow = { level: number; percent: string; enabled: boolean };

const moneyField = (min: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((s) => Number(s.replace(/,/g, "")))
    .refine((n) => Number.isFinite(n), "Enter a valid number")
    .refine((n) => n >= min, `Must be at least ${min.toLocaleString()}`);

const optionalMoneyField = (min: number, label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((s) => (s === undefined || s === "" ? 0 : Number(s.replace(/,/g, ""))))
    .refine((n) => Number.isFinite(n), "Enter a valid number")
    .refine((n) => n >= min, `Must be at least ${min.toLocaleString()}`);

const roiPoolField = z
  .string()
  .trim()
  .min(1, "ROI pool % is required")
  .transform((s) => Number(s.replace(/,/g, "")))
  .refine((n) => Number.isFinite(n), "Enter a valid number")
  .refine((n) => Number.isInteger(n), "Use a whole number")
  .refine((n) => n >= 1 && n <= 100, "Must be between 1 and 100");

const planSchema = z.object({
  planKind: z.enum(["mlm", "standalone"]),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  amount: moneyField(100, "Investment amount"),
  dailyRoi: moneyField(1, "Daily ROI"),
  maxReturn: moneyField(100, "Max return"),
  maxDays: z
    .string()
    .trim()
    .min(1, "Duration (days) is required")
    .transform((s) => Number(s))
    .refine((n) => Number.isFinite(n) && Number.isInteger(n), "Enter a whole number of days")
    .refine((n) => n >= 1, "At least 1 day"),
  description: z.string().optional(),
  directBonus: optionalMoneyField(0, "Direct bonus"),
  binaryPairVolume: optionalMoneyField(1, "Binary BV per pair"),
  binaryPairPayout: optionalMoneyField(0, "Binary payout per pair"),
  roiPoolPercent: roiPoolField,
  levelIncomeEnabled: z.boolean(),
});
type PlanFormInput = z.input<typeof planSchema>;
type PlanForm = z.output<typeof planSchema>;

function isStandalone(p: { planKind?: PlanKind }) {
  return p.planKind === "standalone";
}

const emptyPlanForm: PlanFormInput = {
  planKind: "mlm",
  name: "",
  amount: "",
  dailyRoi: "",
  maxReturn: "",
  maxDays: "",
  description: "",
  directBonus: "20",
  binaryPairVolume: "200",
  binaryPairPayout: "80",
  roiPoolPercent: "100",
  levelIncomeEnabled: false,
};

function rowsFromGlobalLevels(levels: LevelIncomeTier[]): LevelTierRow[] {
  if (!levels.length) return [{ level: 1, percent: "5", enabled: true }];
  return levels.map((t) => ({
    level: t.level,
    percent: String(t.percent),
    enabled: t.percent > 0,
  }));
}

function rowsFromPlan(planTiers: LevelIncomeTier[] | undefined, globalLevels: LevelIncomeTier[]): LevelTierRow[] {
  const base = globalLevels.length ? globalLevels : [{ level: 1, percent: 5 }];
  const planMap = new Map((planTiers ?? []).map((t) => [t.level, t.percent]));
  return base.map((g) => {
    const pct = planMap.has(g.level) ? planMap.get(g.level)! : g.percent;
    return { level: g.level, percent: String(pct), enabled: pct > 0 };
  });
}

function tiersFromRows(rows: LevelTierRow[]): { ok: true; levels: LevelIncomeTier[] } | { ok: false; message: string } {
  if (!rows.length) return { ok: false, message: "Configure at least one level." };
  const levels: LevelIncomeTier[] = [];
  for (const row of rows) {
    const level = row.level;
    const percent = row.enabled ? Math.round(Number(row.percent)) : 0;
    if (!Number.isInteger(level) || level < 1) {
      return { ok: false, message: "Invalid level number." };
    }
    if (row.enabled && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      return { ok: false, message: `Level ${level}: percent must be 0–100.` };
    }
    levels.push({ level, percent });
  }
  if (!levels.some((t) => t.percent > 0)) {
    return { ok: false, message: "Enable at least one level with a percent greater than 0." };
  }
  return { ok: true, levels };
}

function formatLevelIncomeSummary(levels: { level: number; percent: number }[] | undefined): string {
  if (!levels?.length) return "Not configured";
  const active = levels.filter((t) => t.percent > 0);
  if (!active.length) return "No active levels";
  return active.map((t) => `L${t.level}: ${t.percent}%`).join(" · ");
}

export default function AdminPlans() {
  const { binaryPlanEnabled, directIncomeEnabled } = usePlatformFeatures();
  const { data: adminSettings } = useAdminGetSettings();
  const { data: levelIncomeConfig } = useAdminGetLevelIncome();
  const standaloneCreateOnly = Boolean(adminSettings?.standalonePlanCreationOnly);
  const { data: plans, isLoading } = useAdminGetPlans();
  const { mutate: deletePlan } = useAdminDeletePlan();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanWithKind | null>(null);
  const [levelTierRows, setLevelTierRows] = useState<LevelTierRow[]>([]);

  const globalLevelIncome = levelIncomeConfig?.levels ?? [];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PlanFormInput, unknown, PlanForm>({
    resolver: zodResolver(planSchema) as Resolver<PlanFormInput, unknown, PlanForm>,
    defaultValues: emptyPlanForm,
  });

  const planKind = watch("planKind");
  const levelIncomeEnabled = watch("levelIncomeEnabled");
  const isCreateModal = !editingPlan;
  const forceStandaloneCreate = isCreateModal && standaloneCreateOnly;
  const standaloneMode = planKind === "standalone" || forceStandaloneCreate;

  const defaultLevelIncomeForNewPlan =
    !standaloneCreateOnly && Boolean(levelIncomeConfig?.defaultOnNewPlans);

  const seedLevelTierRows = useCallback(
    (plan: PlanWithKind | null) => {
      if (plan?.levelIncomeTiers?.length) {
        setLevelTierRows(rowsFromPlan(plan.levelIncomeTiers, globalLevelIncome));
      } else {
        setLevelTierRows(rowsFromGlobalLevels(globalLevelIncome));
      }
    },
    [globalLevelIncome],
  );

  const openNew = useCallback(() => {
    setEditingPlan(null);
    reset({
      ...emptyPlanForm,
      planKind: standaloneCreateOnly ? "standalone" : "mlm",
      levelIncomeEnabled: defaultLevelIncomeForNewPlan,
    });
    setLevelTierRows(rowsFromGlobalLevels(globalLevelIncome));
    setIsModalOpen(true);
  }, [reset, standaloneCreateOnly, defaultLevelIncomeForNewPlan, globalLevelIncome]);

  const openEdit = useCallback(
    (p: PlanWithKind) => {
      setEditingPlan(p);
      const kind: PlanKind = p.planKind === "standalone" ? "standalone" : "mlm";
      reset({
        planKind: kind,
        name: p.name,
        amount: String(p.amount),
        dailyRoi: String(p.dailyRoi),
        maxReturn: String(p.maxReturn),
        maxDays: String(p.maxDays),
        description: p.description ?? "",
        directBonus: String(p.directBonus),
        binaryPairVolume: String(p.binaryPairVolume),
        binaryPairPayout: String(p.binaryPairPayout),
        roiPoolPercent: String(p.roiPoolPercent),
        levelIncomeEnabled: Boolean(p.levelIncomeEnabled),
      });
      seedLevelTierRows(p);
      setIsModalOpen(true);
    },
    [reset, seedLevelTierRows],
  );

  const onSubmit = async (data: PlanForm) => {
    const planKindResolved = forceStandaloneCreate ? "standalone" : data.planKind;
    const standalone = planKindResolved === "standalone";
    const levelIncomeOn = !standalone && data.levelIncomeEnabled;

    let levelIncomeTiers: LevelIncomeTier[] | undefined;
    if (levelIncomeOn) {
      const parsedTiers = tiersFromRows(levelTierRows);
      if (!parsedTiers.ok) {
        toast.error(parsedTiers.message);
        return;
      }
      levelIncomeTiers = parsedTiers.levels;
    }

    const payload = {
      name: data.name,
      amount: data.amount,
      dailyRoi: data.dailyRoi,
      maxReturn: data.maxReturn,
      maxDays: data.maxDays,
      description: data.description?.trim() ? data.description.trim() : undefined,
      isActive: editingPlan ? editingPlan.isActive : true,
      planKind: planKindResolved,
      directBonus: standalone || !directIncomeEnabled ? 0 : data.directBonus,
      binaryPairVolume: standalone ? 1 : data.binaryPairVolume,
      binaryPairPayout: standalone ? 0 : data.binaryPairPayout,
      roiPoolPercent: data.roiPoolPercent,
      levelIncomeEnabled: levelIncomeOn,
      ...(levelIncomeOn && levelIncomeTiers ? { levelIncomeTiers } : {}),
    };
    setIsSaving(true);
    const plansQueryKey = getAdminGetPlansQueryKey();
    try {
      if (editingPlan) {
        const updated = await adminUpdatePlan(editingPlan.id, payload);
        queryClient.setQueryData<PlanWithKind[]>(plansQueryKey, (old) =>
          old ? old.map((p) => (p.id === updated.id ? { ...updated, planKind: planKindResolved } : p)) : old,
        );
        toast.success("Plan updated");
      } else {
        const created = await adminCreatePlan(payload);
        queryClient.setQueryData<PlanWithKind[]>(plansQueryKey, (old) =>
          old ? [...old, { ...created, planKind: planKindResolved }] : old,
        );
        toast.success("Plan created");
      }
      await queryClient.invalidateQueries({ queryKey: plansQueryKey });
      setIsModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save plan");
    } finally {
      setIsSaving(false);
    }
  };

  const onInvalid = () => {
    toast.error("Fix the fields in the form and try again.");
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure? This hides the plan from new users.")) {
      deletePlan(
        { planId: id },
        {
          onSuccess: () => {
            toast.success("Plan deleted");
            void queryClient.invalidateQueries({ queryKey: getAdminGetPlansQueryKey() });
          },
        },
      );
    }
  };

  return (
    <AppLayout isAdmin>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold">Investment Plans</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {binaryPlanEnabled
              ? directIncomeEnabled
                ? "MLM plans include direct referral, binary, and level income. Standalone plans are ROI-only (self-activate, no gift)."
                : "MLM plans use binary and level income (direct income off in Settings). Standalone plans are ROI-only."
              : directIncomeEnabled
                ? "Smart Binary is off — MLM plans use direct referral and level income. Standalone plans are ROI-only."
                : "Smart Binary and direct income are off — MLM plans use level income only. Standalone plans are ROI-only."}
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Add Plan
        </Button>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading plans…</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {(plans as PlanWithKind[] | undefined)?.map((plan) => (
          <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""}>
            <div className="p-6 border-b border-border flex justify-between items-start gap-2">
              <div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="text-2xl font-bold text-primary mt-1">{formatINR(plan.amount)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={plan.isActive ? "success" : "default"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                {isStandalone(plan) ? (
                  <Badge variant="outline" className="text-xs">
                    Standalone
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    MLM
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily ROI:</span>{" "}
                <span className="font-semibold">{formatINR(plan.dailyRoi)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Return:</span>{" "}
                <span className="font-semibold">{formatINR(plan.maxReturn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>{" "}
                <span className="font-semibold">{plan.maxDays} Days</span>
              </div>
              {isStandalone(plan) ? (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  ROI only · self-activation · cannot gift to another member
                </p>
              ) : (
                <div className="border-t border-border pt-3 mt-3 space-y-2 text-xs">
                  <p className="font-semibold text-foreground">Payout rules</p>
                  {directIncomeEnabled ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Direct bonus</span>
                      <span className="font-mono tabular-nums">{formatINR(plan.directBonus)}</span>
                    </div>
                  ) : null}
                  {binaryPlanEnabled ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Binary pair</span>
                      <span className="font-mono tabular-nums text-right">
                        {plan.binaryPairVolume} BV → {formatINR(plan.binaryPairPayout)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">ROI pool / day</span>
                    <span className="font-mono tabular-nums">{plan.roiPoolPercent}% of daily ROI</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Level income</span>
                    <span className="font-mono tabular-nums text-right text-xs leading-snug">
                      {plan.levelIncomeEnabled
                        ? formatLevelIncomeSummary(plan.levelIncomeTiers ?? levelIncomeConfig?.levels)
                        : "Off"}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button type="button" variant="ghost-danger" size="icon" onClick={() => handleDelete(plan.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPlan ? "Edit Plan" : "Create Plan"}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
          {forceStandaloneCreate ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
              <Label className="font-semibold">Standalone plan</Label>
              <p className="text-xs text-muted-foreground">
                ROI only — no referral programme and no gift activation for other members. New plans are standalone
                only while this mode is enabled in{" "}
                <Link href="/admin/settings" className="text-primary hover:underline">
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="font-semibold">Standalone plan</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  ROI only — no referral programme and no gift activation for other members.
                </p>
              </div>
              <Switch
                checked={standaloneMode}
                onCheckedChange={(on) => setValue("planKind", on ? "standalone" : "mlm", { shouldValidate: true })}
              />
            </div>
          )}

          {!standaloneMode && (!binaryPlanEnabled || !directIncomeEnabled) ? (
            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 leading-relaxed">
              {[
                !binaryPlanEnabled && "Smart Binary is off — binary pair fields are hidden.",
                !directIncomeEnabled && "Direct income is off — direct bonus is hidden.",
              ]
                .filter(Boolean)
                .join(" ")}{" "}
              Change this in{" "}
              <Link href="/admin/settings" className="text-primary hover:underline">
                Settings
              </Link>
              .
            </p>
          ) : null}

          <fieldset className="space-y-4 border-0 p-0 m-0 min-w-0">
            <legend className="text-sm font-semibold text-foreground mb-3 block w-full">Plan details</legend>
            <div className="space-y-2">
              <Label>Plan name</Label>
              <Input {...register("name")} aria-invalid={!!errors.name} />
              {errors.name?.message ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input {...register("description")} />
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-0 p-0 m-0 min-w-0">
            <legend className="text-sm font-semibold text-foreground mb-3 block w-full">ROI &amp; duration</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Investment amount (₹)</Label>
                <Input type="number" inputMode="decimal" step="any" {...register("amount")} aria-invalid={!!errors.amount} />
                {errors.amount?.message ? <p className="text-sm text-destructive">{errors.amount.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>Daily ROI (₹)</Label>
                <Input type="number" inputMode="decimal" step="any" {...register("dailyRoi")} aria-invalid={!!errors.dailyRoi} />
                {errors.dailyRoi?.message ? <p className="text-sm text-destructive">{errors.dailyRoi.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>Max return (₹)</Label>
                <Input type="number" inputMode="decimal" step="any" {...register("maxReturn")} aria-invalid={!!errors.maxReturn} />
                {errors.maxReturn?.message ? <p className="text-sm text-destructive">{errors.maxReturn.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>Max days</Label>
                <Input type="number" inputMode="numeric" step={1} {...register("maxDays")} aria-invalid={!!errors.maxDays} />
                {errors.maxDays?.message ? <p className="text-sm text-destructive">{errors.maxDays.message}</p> : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>ROI pool allocation (%)</Label>
                <Input type="number" inputMode="numeric" step={1} {...register("roiPoolPercent")} aria-invalid={!!errors.roiPoolPercent} />
                <p className="text-xs text-muted-foreground">Share of daily ROI credited each business day (1–100).</p>
                {errors.roiPoolPercent?.message ? (
                  <p className="text-sm text-destructive">{errors.roiPoolPercent.message}</p>
                ) : null}
              </div>
            </div>
          </fieldset>

          {!standaloneMode ? (
            <fieldset className="space-y-4 border-0 p-0 m-0 min-w-0">
              <legend className="text-sm font-semibold text-foreground mb-3 block w-full">Team income (MLM)</legend>

              {directIncomeEnabled ? (
                <div className="space-y-2">
                  <Label>Direct bonus (₹)</Label>
                  <Input type="number" inputMode="decimal" step="any" {...register("directBonus")} aria-invalid={!!errors.directBonus} />
                  <p className="text-xs text-muted-foreground">Paid to the sponsor on a referral&apos;s first investment only.</p>
                  {errors.directBonus?.message ? <p className="text-sm text-destructive">{errors.directBonus.message}</p> : null}
                </div>
              ) : null}

              {binaryPlanEnabled ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Binary pool — BV per pair</Label>
                    <Input type="number" inputMode="numeric" step={1} {...register("binaryPairVolume")} aria-invalid={!!errors.binaryPairVolume} />
                    {errors.binaryPairVolume?.message ? (
                      <p className="text-sm text-destructive">{errors.binaryPairVolume.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Binary pool — ₹ per pair</Label>
                    <Input type="number" inputMode="decimal" step="any" {...register("binaryPairPayout")} aria-invalid={!!errors.binaryPairPayout} />
                    {errors.binaryPairPayout?.message ? (
                      <p className="text-sm text-destructive">{errors.binaryPairPayout.message}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="font-semibold">Level income</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Percent of this member&apos;s daily ROI paid to each upline level (2× cap applies). Percents
                      default from{" "}
                      <Link href="/admin/level-income" className="text-primary hover:underline">
                        global level income
                      </Link>
                      ; enable or disable each level for this plan only.
                    </p>
                  </div>
                  <Switch
                    checked={levelIncomeEnabled}
                    onCheckedChange={(on) => {
                      setValue("levelIncomeEnabled", on, { shouldValidate: true });
                      if (on && levelTierRows.length === 0) {
                        setLevelTierRows(rowsFromGlobalLevels(globalLevelIncome));
                      }
                    }}
                  />
                </div>
                {levelIncomeEnabled ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {levelTierRows.map((row, index) => (
                      <div
                        key={row.level}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2"
                      >
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(on) =>
                            setLevelTierRows((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, enabled: on } : r)),
                            )
                          }
                          aria-label={`Enable level ${row.level}`}
                        />
                        <span className="text-sm font-medium w-16 shrink-0">Level {row.level}</span>
                        <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            disabled={!row.enabled}
                            value={row.percent}
                            onChange={(e) =>
                              setLevelTierRows((prev) =>
                                prev.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)),
                              )
                            }
                            className="h-9"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">% of ROI</span>
                        </div>
                      </div>
                    ))}
                    {levelTierRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Add levels in global Level income settings first.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </fieldset>
          ) : null}

          <input type="hidden" {...register("planKind")} />
          <Button type="submit" className="w-full" isLoading={isSaving}>
            Save Plan
          </Button>
        </form>
      </Modal>
    </AppLayout>
  );
}

