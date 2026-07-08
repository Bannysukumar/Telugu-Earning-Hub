import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetLevelIncome,
  useAdminUpdateLevelIncome,
  getAdminGetLevelIncomeQueryKey,
  type LevelIncomeTier,
} from "@workspace/api-client-react";
import { Button, Card, Input, Label } from "@/components/ui/core";
import { Switch } from "@/components/ui/switch";
import { Layers, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type TierRow = { level: string; percent: string };

function tiersToRows(levels: LevelIncomeTier[]): TierRow[] {
  return levels.map((t) => ({ level: String(t.level), percent: String(t.percent) }));
}

function rowsToTiers(rows: TierRow[]): { ok: true; levels: LevelIncomeTier[] } | { ok: false; message: string } {
  if (rows.length === 0) return { ok: false, message: "Add at least one level." };
  const levels: LevelIncomeTier[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const level = Number(row.level);
    const percent = Number(row.percent);
    if (!Number.isInteger(level) || level < 1) {
      return { ok: false, message: "Each row needs a valid level number (1 or higher)." };
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return { ok: false, message: "Each percent must be between 0 and 100." };
    }
    if (seen.has(level)) return { ok: false, message: `Duplicate level ${level}.` };
    seen.add(level);
    levels.push({ level, percent: Math.round(percent) });
  }
  if (!levels.some((t) => t.percent > 0)) {
    return { ok: false, message: "At least one level must have a percent greater than 0." };
  }
  levels.sort((a, b) => a.level - b.level);
  return { ok: true, levels };
}

export default function AdminLevelIncome() {
  const { data, isLoading } = useAdminGetLevelIncome();
  const { mutate: save, isPending } = useAdminUpdateLevelIncome();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<TierRow[]>([{ level: "1", percent: "5" }]);

  useEffect(() => {
    if (data?.levels?.length) {
      setRows(tiersToRows(data.levels));
    }
  }, [data?.levels]);

  const maxLevels = data?.maxLevels ?? 32;

  const addLevel = () => {
    if (rows.length >= maxLevels) {
      toast.error(`Maximum ${maxLevels} levels.`);
      return;
    }
    const used = new Set(rows.map((r) => Number(r.level)).filter((n) => Number.isInteger(n) && n >= 1));
    let next = 1;
    while (used.has(next) && next <= maxLevels) next++;
    if (next > maxLevels) {
      toast.error("All level numbers 1–32 are already used.");
      return;
    }
    setRows((prev) => [...prev, { level: String(next), percent: "0" }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const onSave = () => {
    const parsed = rowsToTiers(rows);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    save(
      { data: { levels: parsed.levels } },
      {
        onSuccess: () => {
          toast.success("Level income schedule saved.");
          void queryClient.invalidateQueries({ queryKey: getAdminGetLevelIncomeQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  const persistDefaultOnNewPlans = (next: boolean) => {
    if (data?.defaultOnNewPlans === next) return;
    save(
      { data: { defaultOnNewPlans: next } },
      {
        onSuccess: () => {
          toast.success(
            next
              ? "New MLM plans will enable level income by default in Create Plan."
              : "New plans will not auto-enable level income.",
          );
          void queryClient.invalidateQueries({ queryKey: getAdminGetLevelIncomeQueryKey() });
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Save failed"),
      },
    );
  };

  return (
    <AppLayout isAdmin>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <Layers className="h-8 w-8 text-primary" />
          Level income
        </h2>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Define how much each upline generation earns as a percent of a downline member&apos;s{" "}
          <strong className="text-foreground">credited daily ROI</strong>. Level 1 is the direct sponsor, level 2 is
          their sponsor, and so on. View the sponsor line on{" "}
          <Link href="/admin/investment-tree-level" className="text-primary hover:underline">
            Investment team tree
          </Link>
          . Enable level income on each MLM plan under{" "}
          <Link href="/admin/plans" className="text-primary hover:underline">
            Investment Plans
          </Link>
          .
        </p>
      </div>

      <Card className="max-w-2xl mb-6">
        <div className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">Auto-enable on new plans</h3>
            <p className="text-sm text-muted-foreground mt-1">
              When on, <strong className="text-foreground">Create Plan</strong> turns level income on automatically for
              new MLM packages. You can still switch it off for any single plan in the plan form.
            </p>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Switch
              checked={Boolean(data?.defaultOnNewPlans)}
              onCheckedChange={(on) => persistDefaultOnNewPlans(on)}
              disabled={isPending}
            />
          )}
        </div>
      </Card>

      <Card className="max-w-2xl">
        <div className="p-6 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Level schedule</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Example: downline ROI ₹100, level 1 at 5% → sponsor gets ₹5 (until their 2× cap).
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLevel} disabled={rows.length >= maxLevels}>
            <Plus className="h-4 w-4 mr-1" /> Add level
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={`${index}-${row.level}`} className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1 w-28">
                      <Label>Level</Label>
                      <Input
                        type="number"
                        min={1}
                        max={maxLevels}
                        value={row.level}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, level: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1 flex-1 min-w-[8rem]">
                      <Label>% of downline ROI</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={row.percent}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost-danger"
                      size="icon"
                      className="shrink-0"
                      onClick={() => removeRow(index)}
                      disabled={rows.length <= 1}
                      aria-label="Remove level"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Up to {maxLevels} levels. Payouts count toward each upline&apos;s 2× investment cap.</p>
              <Button type="button" onClick={onSave} isLoading={isPending} className="w-full sm:w-auto">
                Save level schedule
              </Button>
            </>
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
