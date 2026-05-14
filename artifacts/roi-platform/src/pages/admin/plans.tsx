import { AppLayout } from "@/components/layout/app-layout";
import {
  useAdminGetPlans,
  useAdminDeletePlan,
  adminCreatePlan,
  adminUpdatePlan,
  type Plan,
} from "@workspace/api-client-react";
import { Card, Button, Modal, Input, Label, Badge } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

/** Avoid z.coerce on empty inputs (becomes 0 and fails min) with no user feedback — require non-empty strings then parse. */
const moneyField = (min: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((s) => Number(s.replace(/,/g, "")))
    .refine((n) => Number.isFinite(n), "Enter a valid number")
    .refine((n) => n >= min, `Must be at least ${min.toLocaleString()}`);

const planSchema = z.object({
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
});
type PlanFormInput = z.input<typeof planSchema>;
type PlanForm = z.output<typeof planSchema>;

const emptyPlanForm: PlanFormInput = {
  name: "",
  amount: "",
  dailyRoi: "",
  maxReturn: "",
  maxDays: "",
  description: "",
};

export default function AdminPlans() {
  const { data: plans, isLoading } = useAdminGetPlans();
  const { mutate: deletePlan } = useAdminDeletePlan();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanFormInput, unknown, PlanForm>({
    resolver: zodResolver(planSchema) as Resolver<PlanFormInput, unknown, PlanForm>,
    defaultValues: {
      name: "",
      amount: "",
      dailyRoi: "",
      maxReturn: "",
      maxDays: "",
      description: "",
    },
  });

  const openNew = useCallback(() => {
    setEditingPlan(null);
    reset(emptyPlanForm);
    setIsModalOpen(true);
  }, [reset]);

  const openEdit = useCallback(
    (p: Plan) => {
      setEditingPlan(p);
      reset({
        name: p.name,
        amount: String(p.amount),
        dailyRoi: String(p.dailyRoi),
        maxReturn: String(p.maxReturn),
        maxDays: String(p.maxDays),
        description: p.description ?? "",
      });
      setIsModalOpen(true);
    },
    [reset],
  );

  const onSubmit = async (data: PlanForm) => {
    const payload = {
      ...data,
      description: data.description?.trim() ? data.description.trim() : undefined,
      isActive: true,
    };
    setIsSaving(true);
    try {
      if (editingPlan) {
        await adminUpdatePlan(editingPlan.id, payload);
        toast.success("Plan updated");
      } else {
        await adminCreatePlan(payload);
        toast.success("Plan created");
      }
      await queryClient.invalidateQueries();
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
    if(confirm("Are you sure? This hides the plan from new users.")) {
      deletePlan({ planId: id }, {
        onSuccess: () => { toast.success("Plan deleted"); queryClient.invalidateQueries(); }
      });
    }
  };

  return (
    <AppLayout isAdmin>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold">Investment Plans</h2>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4"/> Add Plan</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {plans?.map(plan => (
          <Card key={plan.id} className={!plan.isActive ? "opacity-60" : ""}>
            <div className="p-6 border-b border-border flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="text-2xl font-bold text-primary mt-1">{formatINR(plan.amount)}</div>
              </div>
              <Badge variant={plan.isActive ? "success" : "default"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Daily ROI:</span> <span className="font-semibold">{formatINR(plan.dailyRoi)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Return:</span> <span className="font-semibold">{formatINR(plan.maxReturn)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration:</span> <span className="font-semibold">{plan.maxDays} Days</span></div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => openEdit(plan)}><Edit className="h-4 w-4 mr-2"/> Edit</Button>
                <Button variant="ghost-danger" size="icon" onClick={() => handleDelete(plan.id)}><Trash2 className="h-4 w-4"/></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPlan ? "Edit Plan" : "Create Plan"}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Plan Name</Label>
            <Input {...register("name")} aria-invalid={!!errors.name} />
            {errors.name?.message ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Investment Amount</Label>
              <Input type="number" inputMode="decimal" step="any" {...register("amount")} aria-invalid={!!errors.amount} />
              {errors.amount?.message ? <p className="text-sm text-destructive">{errors.amount.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Daily ROI</Label>
              <Input type="number" inputMode="decimal" step="any" {...register("dailyRoi")} aria-invalid={!!errors.dailyRoi} />
              {errors.dailyRoi?.message ? <p className="text-sm text-destructive">{errors.dailyRoi.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Max Return</Label>
              <Input type="number" inputMode="decimal" step="any" {...register("maxReturn")} aria-invalid={!!errors.maxReturn} />
              {errors.maxReturn?.message ? <p className="text-sm text-destructive">{errors.maxReturn.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Max Days</Label>
              <Input type="number" inputMode="numeric" step={1} {...register("maxDays")} aria-invalid={!!errors.maxDays} />
              {errors.maxDays?.message ? <p className="text-sm text-destructive">{errors.maxDays.message}</p> : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input {...register("description")} />
          </div>
          <Button type="submit" className="w-full" isLoading={isSaving}>
            Save Plan
          </Button>
        </form>
      </Modal>
    </AppLayout>
  );
}
