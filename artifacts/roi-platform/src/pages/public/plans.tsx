import { PublicLayout } from "@/components/layout/public-layout";
import {
  useGetPlans,
  useCreateInvestment,
  useGetMyInvestments,
  getGetMyInvestmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, Modal, Button, Badge } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { Check } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformFeatures } from "@/hooks/use-platform-features";
import {
  activateGrowthPlan,
  getGrowthDashboard,
  getGrowthPlanSettingsPublic,
  type GrowthAdminSettings,
  type GrowthDashboard,
} from "@/lib/growth-plan-api";

const SMART_GROWTH_PLAN_ID = "__smart_growth__";

export default function Plans() {
  const { user } = useAuth();
  const { binaryPlanEnabled } = usePlatformFeatures();
  const { data: plans, isLoading } = useGetPlans();
  const { data: myInvestments } = useGetMyInvestments({
    query: { enabled: Boolean(user), queryKey: getGetMyInvestmentsQueryKey() },
  });

  const activeCountByPlanId = (planId: string) =>
    myInvestments?.filter((inv) => inv.planId === planId && inv.isActive).length ?? 0;

  const { mutate: invest, isPending } = useCreateInvestment();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [growthInvesting, setGrowthInvesting] = useState(false);

  const [growthSettings, setGrowthSettings] = useState<GrowthAdminSettings | null>(null);
  const [growthDash, setGrowthDash] = useState<GrowthDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getGrowthPlanSettingsPublic();
        if (!cancelled) setGrowthSettings(s);
      } catch {
        if (!cancelled) setGrowthSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setGrowthDash(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await getGrowthDashboard();
        if (!cancelled) setGrowthDash(d);
      } catch {
        if (!cancelled) setGrowthDash(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const growthActive = growthSettings?.planStatus === "active";
  const growthPlanActiveForUser = growthDash?.planStatus === "active";
  const growthAmount = growthSettings?.planAmount ?? 200;

  const handleInvest = () => {
    if (!selectedPlan) return;

    if (selectedPlan === SMART_GROWTH_PLAN_ID) {
      setGrowthInvesting(true);
      void activateGrowthPlan()
        .then(() => {
          toast.success("Smart Growth Plan activated!");
          queryClient.invalidateQueries();
          setSelectedPlan(null);
          setTimeout(() => {
            window.location.href = "/smart-growth";
          }, 800);
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Failed to activate Smart Growth Plan.");
          setSelectedPlan(null);
        })
        .finally(() => setGrowthInvesting(false));
      return;
    }

    invest(
      { data: { planId: selectedPlan } },
      {
        onSuccess: () => {
          toast.success("Investment activated successfully!");
          queryClient.invalidateQueries();
          setSelectedPlan(null);
          setTimeout(() => {
            window.location.href = "/investments";
          }, 1000);
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to invest. Check wallet balance.");
          setSelectedPlan(null);
        },
      },
    );
  };

  const planObj = plans?.find((p) => p.id === selectedPlan);
  const isGrowthSelected = selectedPlan === SMART_GROWTH_PLAN_ID;
  const confirmAmount = isGrowthSelected ? growthAmount : planObj?.amount ?? 0;
  const confirmName = isGrowthSelected
    ? growthSettings?.planName ?? "Smart Growth Plan ₹200"
    : planObj?.name ?? "";
  const confirmBusy = isGrowthSelected ? growthInvesting : isPending;

  return (
    <PublicLayout>
      <div className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Investment Plans</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
            Fund your wallet, then activate a package. You can activate the same plan again anytime — even while another
            position on that plan is still active. Each activation is a separate investment with its own 2× cap
            {binaryPlanEnabled ? ". Smart Binary rules are summarized on the dedicated plan page." : "."}
          </p>
          {binaryPlanEnabled ? (
            <Link href="/binary-plan">
              <Button variant="outline" className="gap-2">
                Read Smart Binary MLM plan
              </Button>
            </Link>
          ) : null}
        </div>

        {isLoading ? (
          <div className="text-center">Loading plans...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {growthActive && growthSettings ? (
              <Card className="relative hover-lift border-emerald-500/40 flex flex-col h-full bg-card ring-1 ring-emerald-500/20">
                <div className="p-8 border-b border-border flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold">{growthSettings.planName}</h3>
                    <Badge variant="success">Smart Growth</Badge>
                    {growthPlanActiveForUser ? <Badge variant="success">Active</Badge> : null}
                  </div>
                  <div className="text-4xl font-display font-bold text-primary mb-4">
                    {formatINR(growthSettings.planAmount)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Daily ROI plan with referral bonus and re-entry after cap. Deducted from your wallet balance.
                  </p>
                </div>

                <CardContent className="p-8 bg-secondary/10">
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary" />
                      <span>
                        <strong className="text-emerald-400">{formatINR(growthSettings.dailyRoi)}</strong> Daily ROI
                      </span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary" />
                      <span>
                        Up to <strong>{formatINR(growthSettings.maxEarnings)}</strong>
                      </span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary" />
                      <span>
                        <strong>{growthSettings.planDuration}</strong> Days Duration
                      </span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-primary" />
                      <span>
                        Direct bonus <strong>{formatINR(growthSettings.directBonus)}</strong>
                      </span>
                    </li>
                  </ul>

                  {user ? (
                    growthPlanActiveForUser ? (
                      <Button className="w-full" variant="outline" onClick={() => (window.location.href = "/smart-growth")}>
                        View Smart Growth
                      </Button>
                    ) : (
                      <Button className="w-full" onClick={() => setSelectedPlan(SMART_GROWTH_PLAN_ID)}>
                        Invest Now
                      </Button>
                    )
                  ) : (
                    <Button className="w-full" onClick={() => (window.location.href = "/login")}>
                      Sign in to Invest
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {plans
              ?.filter((p) => p.isActive)
              .map((plan) => {
                const activeHere = user ? activeCountByPlanId(plan.id) : 0;
                return (
                  <Card key={plan.id} className="relative hover-lift border-primary/20 flex flex-col h-full bg-card">
                    <div className="p-8 border-b border-border flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-2xl font-bold">{plan.name}</h3>
                        {activeHere > 0 ? (
                          <Badge variant="success">
                            {activeHere} active position{activeHere === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-4xl font-display font-bold text-primary mb-4">
                        {formatINR(plan.amount)}
                      </div>
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    </div>

                    <CardContent className="p-8 bg-secondary/10">
                      <ul className="space-y-4 mb-8">
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-primary" />
                          <span>
                            <strong className="text-emerald-400">{formatINR(plan.dailyRoi)}</strong> Daily ROI
                          </span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-primary" />
                          <span>
                            Up to <strong>{formatINR(plan.maxReturn)}</strong>
                          </span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-primary" />
                          <span>
                            <strong>{plan.maxDays}</strong> Days Duration
                          </span>
                        </li>
                        <li className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-primary" />
                          <span>Principal included</span>
                        </li>
                      </ul>

                      {user ? (
                        <Button className="w-full" onClick={() => setSelectedPlan(plan.id)}>
                          {activeHere > 0 ? "Activate again" : "Invest Now"}
                        </Button>
                      ) : (
                        <Button className="w-full" onClick={() => (window.location.href = "/login")}>
                          Sign in to Invest
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}
      </div>

      <Modal isOpen={!!selectedPlan} onClose={() => setSelectedPlan(null)} title="Confirm Investment">
        {(planObj || isGrowthSelected) && (
          <div className="space-y-6">
            <p className="text-muted-foreground">
              {isGrowthSelected ? (
                <>
                  You are about to activate <strong>{confirmName}</strong>. ₹{growthAmount} will be deducted from your
                  wallet. Manage the plan later from Smart Growth.
                </>
              ) : (
                <>
                  You are about to activate <strong>{confirmName}</strong>. This creates a <strong>new position</strong>{" "}
                  with its own cap — you can do this even if you already have an active position on this plan.
                </>
              )}
            </p>

            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount to Deduct:</span>
                <span className="font-bold text-lg">{formatINR(confirmAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your Wallet Balance:</span>
                <span className="font-bold text-lg">{formatINR(user?.walletBalance || 0)}</span>
              </div>
            </div>

            {(user?.walletBalance || 0) < confirmAmount && (
              <p className="text-destructive text-sm font-medium">
                Insufficient balance. Please contact admin to add funds.
              </p>
            )}

            <div className="flex gap-4 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedPlan(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleInvest}
                isLoading={confirmBusy}
                disabled={(user?.walletBalance || 0) < confirmAmount}
              >
                Confirm Investment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PublicLayout>
  );
}
