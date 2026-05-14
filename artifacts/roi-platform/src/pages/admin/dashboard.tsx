import { AppLayout } from "@/components/layout/app-layout";
import { useAdminGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { Users, Wallet, Target, ArrowRightLeft, Zap, Banknote } from "lucide-react";

/* Trigger Daily ROI — commented out (scheduled via Cloud Function / CRON_SECRET)
import { Button } from "@/components/ui/core";
import { useProcessRoi } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
*/

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminGetDashboard();

  /* Trigger Daily ROI — commented out
  const { mutate: runCron, isPending } = useProcessRoi();
  const queryClient = useQueryClient();

  const handleCron = () => {
    runCron(undefined, {
      onSuccess: (res) => {
        toast.success(res.message);
        queryClient.invalidateQueries();
      },
      onError: (err: any) => toast.error(err.message || "Failed to process ROI")
    });
  };
  */

  if (isLoading) return <AppLayout isAdmin><div className="p-8">Loading...</div></AppLayout>;

  const cards = [
    { title: "Total Users", val: stats?.totalUsers, icon: Users, c: "text-blue-400" },
    { title: "Total Invested", val: formatINR(stats?.totalInvested || 0), icon: Target, c: "text-emerald-400" },
    { title: "Total Earned (Paid out)", val: formatINR(stats?.totalEarned || 0), icon: Wallet, c: "text-purple-400" },
    { title: "Pending Withdrawals", val: stats?.pendingWithdrawals, icon: ArrowRightLeft, c: "text-amber-400" },
    { title: "Pending Deposits (QR)", val: stats?.pendingDeposits ?? 0, icon: Banknote, c: "text-teal-400" },
    { title: "Active Investments", val: stats?.activeInvestments, icon: Zap, c: "text-cyan-400" },
    { title: "Total paid (net)", val: formatINR(stats?.totalWithdrawals || 0), icon: Wallet, c: "text-rose-400" },
  ];

  return (
    <AppLayout isAdmin>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold">Admin Overview</h2>
        <p className="text-muted-foreground">Platform-wide statistics</p>
        {/* Trigger Daily ROI — commented out
        <Button onClick={handleCron} isLoading={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-indigo-500/20">
          <Zap className="mr-2 h-4 w-4"/> Trigger Daily ROI
        </Button>
        */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <Card key={i}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`p-4 rounded-xl bg-secondary ${card.c}`}>
                <card.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <h4 className="text-2xl font-bold">{card.val}</h4>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
