import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import {
  transferWalletToUser,
  resolveMemberForTransfer,
  useGetWithdrawalFeeSettings,
  useGetMyInvestments,
  ApiError,
} from "@workspace/api-client-react";
import { AUTH_ME_QUERY_KEY } from "@/lib/query-keys";
import { Card, CardContent, Button, Input, Label } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { AlertCircle, SendHorizontal, UserSearch } from "lucide-react";

type DestMode = "userId" | "email" | "referral";

export default function TransferFunds() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DestMode>("email");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [resolved, setResolved] = useState<{ id: string; name: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: feeSettings } = useGetWithdrawalFeeSettings();
  const { data: myInvestments } = useGetMyInvestments();
  const peerPct = feeSettings?.peerTransferFeePercent ?? 0;
  const hasActivePlan = myInvestments?.some((inv) => inv.isActive) ?? false;

  const amount = Number(amountStr.replace(/,/g, "").trim());
  const sendFee = Number.isFinite(amount) && amount >= 1 ? Math.round((amount * peerPct) / 100) : 0;
  const recipientNet = Number.isFinite(amount) && amount >= 1 ? amount - sendFee : 0;

  const buildResolveParams = () => {
    if (mode === "userId") return userId.trim() ? { userId: userId.trim() } : undefined;
    if (mode === "email") return email.trim() ? { email: email.trim() } : undefined;
    return referralCode.trim() ? { referralCode: referralCode.trim() } : undefined;
  };

  const buildTransferBody = () => {
    const a = amount;
    if (!Number.isFinite(a) || a < 1) return null;
    if (mode === "userId" && userId.trim()) return { amount: a, toUserId: userId.trim() };
    if (mode === "email" && email.trim()) return { amount: a, toEmail: email.trim() };
    if (mode === "referral" && referralCode.trim()) return { amount: a, toReferralCode: referralCode.trim() };
    return null;
  };

  const handleCheckRecipient = async () => {
    const p = buildResolveParams();
    if (!p) {
      toast.error("Enter a recipient user id, email, or referral code.");
      return;
    }
    setChecking(true);
    setResolved(null);
    try {
      const m = await resolveMemberForTransfer(p);
      setResolved({ id: m.id, name: m.name });
      toast.success("Recipient found.");
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

  const handleSend = async () => {
    const body = buildTransferBody();
    if (!body) {
      toast.error("Enter a valid amount (₹1+) and a complete recipient.");
      return;
    }
    if (user && body.toUserId === user.id) {
      toast.error("Use another member’s details — you cannot transfer to yourself.");
      return;
    }
    setSending(true);
    try {
      await transferWalletToUser(body);
      toast.success("Transfer completed.");
      setResolved(null);
      setAmountStr("");
      await queryClient.invalidateQueries();
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-3xl font-display font-bold">Send funds</h2>
        <p className="text-muted-foreground">
          Move wallet balance to another member using their <strong>email</strong>, <strong>referral code</strong>, or{" "}
          <strong>user id</strong>. You must have an <strong>active investment plan</strong> on your account; both
          accounts must be active. The amount you send is debited in full from your wallet; the recipient receives the
          net after any platform fee (same model as withdrawals).
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {!hasActivePlan ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 flex gap-3 text-sm text-amber-200">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>
                Activate at least one investment plan on your account before you can send funds to another member.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="rounded-xl border border-border bg-secondary/20 p-4 flex justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Your wallet</p>
                <p className="text-xl font-bold text-emerald-400 tabular-nums">{formatINR(user?.walletBalance ?? 0)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recipient lookup</Label>
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
                      setResolved(null);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {mode === "userId" ? (
                <Input
                  placeholder="Firebase / account user id"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setResolved(null);
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
                    setResolved(null);
                  }}
                />
              ) : null}
              {mode === "referral" ? (
                <Input
                  placeholder="Referral code (e.g. from invite link)"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value);
                    setResolved(null);
                  }}
                />
              ) : null}
              <Button type="button" variant="outline" onClick={() => void handleCheckRecipient()} isLoading={checking}>
                <UserSearch className="h-4 w-4 mr-2" />
                Check recipient
              </Button>
              {resolved ? (
                <p className="text-sm text-muted-foreground">
                  Matched: <span className="font-semibold text-foreground">{resolved.name}</span>{" "}
                  <span className="font-mono text-xs">({resolved.id})</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                inputMode="decimal"
                placeholder="e.g. 500"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
              {Number.isFinite(amount) && amount >= 1 && peerPct > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Platform fee {peerPct}%: {formatINR(sendFee)} · Recipient receives {formatINR(recipientNet)} · Your
                  wallet will be debited {formatINR(amount)}
                </p>
              ) : Number.isFinite(amount) && amount >= 1 && peerPct === 0 ? (
                <p className="text-xs text-muted-foreground">No send fee configured. Recipient receives the full amount.</p>
              ) : null}
            </div>

            <Button type="button" className="w-full" onClick={() => void handleSend()} isLoading={sending}>
              <SendHorizontal className="h-4 w-4 mr-2" />
              Send funds
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
