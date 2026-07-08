import { AppLayout } from "@/components/layout/app-layout";
import { Button, Card, Input, Label } from "@/components/ui/core";
import { Switch } from "@/components/ui/switch";
import {
  getAdminGrowthSettings,
  migrateGrowthUsers,
  updateAdminGrowthSettings,
  type GrowthAdminSettings,
} from "@/lib/growth-plan-api";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function AdminGrowthPlan() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-growth-settings"],
    queryFn: getAdminGrowthSettings,
  });
  const [form, setForm] = useState<GrowthAdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const setNum = (key: keyof GrowthAdminSettings, value: string) => {
    if (!form) return;
    setForm({ ...form, [key]: Number(value) });
  };

  const onSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateAdminGrowthSettings(form);
      toast.success("Smart Growth Plan settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin-growth-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onMigrate = async () => {
    setMigrating(true);
    try {
      const res = await migrateGrowthUsers();
      toast.success(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  if (isLoading || !form) {
    return (
      <AppLayout isAdmin>
        <div className="p-8 text-muted-foreground">Loading growth plan settings...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout isAdmin>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          Smart Growth Plan
        </h2>
        <p className="text-muted-foreground mt-1">
          Configure the separate ₹200 plan. Changes apply from Firestore without code deploy.
        </p>
      </div>

      <Card className="p-6 max-w-3xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Plan Name</Label>
            <Input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Plan Amount (₹)</Label>
            <Input type="number" value={form.planAmount} onChange={(e) => setNum("planAmount", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Duration (days)</Label>
            <Input type="number" value={form.planDuration} onChange={(e) => setNum("planDuration", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Daily ROI (₹)</Label>
            <Input type="number" value={form.dailyRoi} onChange={(e) => setNum("dailyRoi", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Max Earnings / 2× Cap (₹)</Label>
            <Input type="number" value={form.maxEarnings} onChange={(e) => setNum("maxEarnings", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Direct Bonus (₹)</Label>
            <Input type="number" value={form.directBonus} onChange={(e) => setNum("directBonus", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Min Withdrawal (₹)</Label>
            <Input type="number" value={form.minWithdrawal} onChange={(e) => setNum("minWithdrawal", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Withdrawal Fee (%)</Label>
            <Input
              type="number"
              value={form.withdrawalFeePercent}
              onChange={(e) => setNum("withdrawalFeePercent", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">Plan Active</span>
            <Switch
              checked={form.planStatus === "active"}
              onCheckedChange={(v) => setForm({ ...form, planStatus: v ? "active" : "inactive" })}
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">Enable Re-entry</span>
            <Switch checked={form.enableReentry} onCheckedChange={(v) => setForm({ ...form, enableReentry: v })} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">Enable ROI</span>
            <Switch checked={form.enableRoi} onCheckedChange={(v) => setForm({ ...form, enableRoi: v })} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">Enable Referral Bonus</span>
            <Switch
              checked={form.enableReferralBonus}
              onCheckedChange={(v) => setForm({ ...form, enableReferralBonus: v })}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={onSave} isLoading={saving}>
            Save Settings
          </Button>
          <Button variant="outline" onClick={onMigrate} isLoading={migrating}>
            Migrate Existing Users
          </Button>
        </div>
      </Card>
    </AppLayout>
  );
}
