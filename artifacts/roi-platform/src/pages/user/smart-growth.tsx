import { AppLayout } from "@/components/layout/app-layout";
import { Button, Card, Badge } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateGrowthPlan,
  getGrowthDashboard,
  reEnterGrowthPlan,
  type GrowthDashboard,
} from "@/lib/growth-plan-api";
import { toast } from "sonner";
import { useState } from "react";
import { Copy, RefreshCw, Sparkles, Users, Wallet } from "lucide-react";
import { Link } from "wouter";

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "completed") return <Badge variant="default">Completed</Badge>;
  if (status === "expired") return <Badge variant="default">Expired</Badge>;
  if (status === "pending" || status === "none" || status === "inactive") {
    return <Badge variant="outline">Not activated</Badge>;
  }
  return <Badge variant="default">Not joined</Badge>;
}

export default function SmartGrowthPlan() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["growth-plan-dashboard"],
    queryFn: getGrowthDashboard,
  });

  const runActivate = async (reEntry = false) => {
    setBusy(true);
    try {
      if (reEntry) await reEnterGrowthPlan();
      else await activateGrowthPlan();
      toast.success(reEntry ? "Plan re-activated successfully" : "Smart Growth Plan activated");
      await queryClient.invalidateQueries();
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not activate plan");
    } finally {
      setBusy(false);
    }
  };

  const copyReferral = async (dash: GrowthDashboard) => {
    const origin = window.location.origin;
    const link = `${origin}/register?ref=${dash.referralCode}`;
    await navigator.clipboard.writeText(link);
    toast.success("Referral link copied");
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-muted-foreground">Loading Smart Growth Plan...</div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout>
        <div className="p-8 space-y-4">
          <p className="text-destructive">
            {error instanceof Error ? error.message : "Could not load Smart Growth Plan."}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </div>
      </AppLayout>
    );
  }

  const canActivate =
    data.planStatus === "pending" || data.planStatus === "none" || data.planStatus === "inactive";
  const canReEnter =
    Boolean(data.settings.enableReentry) &&
    data.canReEnter &&
    (data.planStatus === "expired" || data.planStatus === "completed");

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Smart Growth Plan
          </h2>
          <p className="text-muted-foreground mt-1">
            Separate ₹200 ROI + direct referral program. Existing investment plans are unchanged.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <h3 className="text-2xl font-bold">{data.settings.planName}</h3>
              <div className="mt-2">{statusBadge(data.planStatus)}</div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Investment</p>
              <p className="text-3xl font-bold text-primary">{formatINR(data.planAmount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground">Remaining Days</p>
              <p className="text-xl font-semibold">{data.remainingDays}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today's ROI</p>
              <p className="text-xl font-semibold">{formatINR(data.todaysRoi)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cycle</p>
              <p className="text-xl font-semibold">#{data.currentCycle || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Re-entries</p>
              <p className="text-xl font-semibold">{data.reEntryCount}</p>
            </div>
          </div>

          <div className="mb-2 flex justify-between text-sm">
            <span>Current Plan Earnings</span>
            <span className="font-semibold">
              {formatINR(data.currentPlanIncome)} / {formatINR(data.maxEarnings)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden mb-6">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${data.progressPct}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {canActivate ? (
              <Button onClick={() => runActivate(false)} isLoading={busy}>
                Activate for {formatINR(data.settings.planAmount)}
              </Button>
            ) : null}
            {canReEnter ? (
              <Button onClick={() => runActivate(true)} isLoading={busy}>
                Re-enter Plan
              </Button>
            ) : null}
            {data.planStatus === "active" ? (
              <Link href="/withdraw">
                <Button variant="outline">Withdraw Funds</Button>
              </Link>
            ) : null}
            <Link href="/add-fund">
              <Button variant="ghost">Add Funds</Button>
            </Link>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Wallet</h3>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Wallet Balance</p>
            <p className="text-2xl font-bold">{formatINR(data.walletBalance)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">ROI Income</p>
              <p className="font-semibold">{formatINR(data.roiIncome)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Direct Income</p>
              <p className="font-semibold">{formatINR(data.directIncome)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lifetime</p>
              <p className="font-semibold">{formatINR(data.lifetimeIncome)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Min Withdraw</p>
              <p className="font-semibold">{formatINR(data.settings.minWithdrawal)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium mb-1">Withdrawal eligibility</p>
            {data.isEligibleWithdrawal ? (
              <p className="text-emerald-500">Eligible — active plan + 2 active directs</p>
            ) : (
              <p className="text-amber-500">
                {data.planStatus !== "active"
                  ? "Activate your plan"
                  : data.activeDirects < 2
                    ? "Need 2 Active Direct Referrals"
                    : "Not eligible yet"}
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" /> Direct Referrals
            </h3>
            <Badge variant="default">
              {data.activeDirects} active / {data.totalDirects} total
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Direct bonus {formatINR(data.settings.directBonus)} — paid only once per referred user on their first activation.
          </p>
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => copyReferral(data)}>
              <Copy className="h-4 w-4 mr-2" /> Copy referral link
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {data.directs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No direct referrals yet.</p>
            ) : (
              data.directs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-muted-foreground text-xs">{d.email}</p>
                  </div>
                  {statusBadge(d.planStatus)}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Plan Rules</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Duration: {data.settings.planDuration} days</li>
            <li>• Daily ROI: {formatINR(data.settings.dailyRoi)} (admin configurable)</li>
            <li>• 2× cap: {formatINR(data.settings.maxEarnings)} per cycle</li>
            <li>• Withdraw only with active plan + 2 active direct referrals on ₹200 plan</li>
            <li>• Re-entry allowed after expiry or completing the 2× cap</li>
          </ul>
        </Card>
      </div>
    </AppLayout>
  );
}
