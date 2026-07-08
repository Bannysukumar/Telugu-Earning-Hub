import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import {
  useGetPlans,
  createInvestment,
  resolveMemberForTransfer,
  useGetWithdrawalFeeSettings,
  useGetMyInvestments,
  ApiError,
} from "@workspace/api-client-react";
import { AUTH_ME_QUERY_KEY } from "@/lib/query-keys";
import { Card, CardContent, Button, Input, Label, Badge } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { AlertCircle, Gift, UserSearch, Check } from "lucide-react";

type DestMode = "userId" | "email" | "referral";

export default function GiftPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = useGetPlans();
  const { data: feeSettings } = useGetWithdrawalFeeSettings();
  const { data: myInvestments } = useGetMyInvestments();
  const peerPct = feeSettings?.peerTransferFeePercent ?? 0;
  const hasActivePlan = myInvestments?.some((inv) => inv.isActive) ?? false;

  const giftFeeOnPlan = (planAmount: number) =>
    peerPct > 0 && Number.isFinite(planAmount) ? Math.round((planAmount * peerPct) / 100) : 0;

  const [mode, setMode] = useState<DestMode>("email");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const buildResolveParams = () => {
    if (mode === "userId") return userId.trim() ? { userId: userId.trim() } : undefined;
    if (mode === "email") return email.trim() ? { email: email.trim() } : undefined;
    return referralCode.trim() ? { referralCode: referralCode.trim() } : undefined;
  };

  const handleResolve = async () => {
    const p = buildResolveParams();
    if (!p) {
      toast.error("Enter the member you want to activate a plan for.");
      return;
    }
    setChecking(true);
    setBeneficiaryId(null);
    setBeneficiaryName(null);
    try {
      const m = await resolveMemberForTransfer(p);
      if (m.id === user?.id) {
        toast.error("Pick another member — you cannot gift a plan to yourself here. Use Invest / plans for your own activation.");
        return;
      }
      setBeneficiaryId(m.id);
      setBeneficiaryName(m.name);
      toast.success("Member verified.");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.data && typeof e.data === "object" ? (e.data as { error?: string }).error : undefined;
        toast.error(typeof body === "string" && body ? body : e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Could not look up that member.");
      }
    } finally {
      setChecking(false);
    }
  };

  const handleActivate = async (planId: string, planAmount: number) => {
    if (!beneficiaryId) {
      toast.error("Verify the beneficiary first.");
      return;
    }
    const fee = giftFeeOnPlan(planAmount);
    const totalDebit = planAmount + fee;
    if ((user?.walletBalance ?? 0) < totalDebit) {
      toast.error(
        fee > 0
          ? `Your wallet needs at least ${formatINR(totalDebit)} (plan + ${peerPct}% fee).`
          : "Your wallet balance is not enough for this plan.",
      );
      return;
    }
    setActivatingId(planId);
    try {
      await createInvestment({ planId, beneficiaryUserId: beneficiaryId });
      toast.success("Plan activated for your member.");
      await queryClient.invalidateQueries();
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed.");
    } finally {
      setActivatingId(null);
    }
  };

  const activePlans = plans?.filter((p) => p.isActive && p.planKind !== "standalone") ?? [];

  return (
    <AppLayout>
      <div className="mb-8 max-w-4xl">
        <h2 className="text-3xl font-display font-bold">Gift a plan</h2>
        <p className="text-muted-foreground">
          Pay from <strong>your wallet</strong> to activate a plan on <strong>another member&apos;s</strong> account
          (they receive ROI and binary volume on their tree). You need an <strong>active investment plan</strong> on your
          own account first. The beneficiary can receive the same plan again even if they already have an active position.
          If a send/gift fee is set by admin, you pay plan price plus that percentage on top; their plan amount stays the
          full package value.
        </p>
      </div>

      <div className="max-w-4xl space-y-8">
        {!hasActivePlan ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex gap-3 text-sm text-amber-200">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>
                Activate at least one investment plan on your account before you can gift or activate a plan for another
                member.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-semibold text-lg">1. Who receives the plan?</h3>
                <p className="text-sm text-muted-foreground">Use email, referral code, or their user id.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Your wallet</p>
                <p className="font-bold text-emerald-400 tabular-nums">{formatINR(user?.walletBalance ?? 0)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["email", "Email"],
                  ["referral", "Referral code"],
                  ["userId", "User id"],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={mode === k ? "default" : "outline"}
                  onClick={() => {
                    setMode(k);
                    setBeneficiaryId(null);
                    setBeneficiaryName(null);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>

            {mode === "userId" ? (
              <Input
                placeholder="Member user id"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setBeneficiaryId(null);
                }}
              />
            ) : null}
            {mode === "email" ? (
              <Input
                type="email"
                placeholder="member@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setBeneficiaryId(null);
                }}
              />
            ) : null}
            {mode === "referral" ? (
              <Input
                placeholder="Referral code"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value);
                  setBeneficiaryId(null);
                }}
              />
            ) : null}

            <Button type="button" variant="outline" onClick={() => void handleResolve()} isLoading={checking}>
              <UserSearch className="h-4 w-4 mr-2" />
              Verify member
            </Button>

            {beneficiaryId && beneficiaryName ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-2 text-sm">
                <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                <span>
                  Ready to activate for <strong>{beneficiaryName}</strong>{" "}
                  <span className="font-mono text-xs text-muted-foreground">({beneficiaryId})</span>
                </span>
              </div>
            ) : (
              <p className="text-sm text-amber-600/90">Verify a member before activating a plan.</p>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="font-display font-semibold text-lg mb-4">2. Choose a plan</h3>
          {isLoading ? (
            <p className="text-muted-foreground">Loading plans…</p>
          ) : activePlans.length === 0 ? (
            <p className="text-muted-foreground">No active plans available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activePlans.map((plan) => {
                const fee = giftFeeOnPlan(plan.amount);
                return (
                <Card key={plan.id} className="border-border/80">
                  <CardContent className="p-6 flex flex-col gap-4 h-full">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-bold text-lg">{plan.name}</h4>
                        <p className="text-2xl font-display font-bold text-primary mt-1 tabular-nums">
                          {formatINR(plan.amount)}
                        </p>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">{plan.description ?? "—"}</p>
                    {peerPct > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        You pay {formatINR(plan.amount + fee)} total ({formatINR(plan.amount)} plan + {formatINR(fee)}{" "}
                        fee at {peerPct}%).
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      disabled={!beneficiaryId}
                      isLoading={activatingId === plan.id}
                      onClick={() => void handleActivate(plan.id, plan.amount)}
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      Activate for them
                    </Button>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
