import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard, useGetMyInvestments } from "@workspace/api-client-react";
import { Card, CardContent, Button, Badge } from "@/components/ui/core";
import { ArrowUpRight, Wallet, Activity, ArrowRightLeft, Target, Users, Copy } from "lucide-react";
import { formatINR, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboard();
  const { data: investments, isLoading: invLoading } = useGetMyInvestments();
  const { user } = useAuth();

  if (statsLoading || invLoading) {
    return <AppLayout><div className="p-8">Loading dashboard...</div></AppLayout>;
  }

  const statCards = [
    { title: "Total Invested", value: stats?.totalInvested || 0, icon: Target, color: "text-blue-400", bg: "bg-blue-400/10" },
    { title: "Total Earned", value: stats?.totalEarned || 0, icon: ArrowUpRight, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { title: "Wallet Balance", value: stats?.walletBalance || 0, icon: Wallet, color: "text-amber-400", bg: "bg-amber-400/10" },
    { title: "Active Plans", value: stats?.activeInvestments || 0, icon: Activity, color: "text-purple-400", bg: "bg-purple-400/10", isCount: true },
  ];

  return (
    <AppLayout>
      <div className="mb-8 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-3xl font-display font-bold">Welcome back</h2>
          <p className="text-muted-foreground">Here is your investment overview</p>
        </div>
        <div className="flex gap-3">
          <Link href="/withdraw"><Button variant="outline"><ArrowRightLeft className="mr-2 h-4 w-4"/> Withdraw</Button></Link>
          <Link href="/plans"><Button><Activity className="mr-2 h-4 w-4"/> Invest Now</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <Card key={i} className="hover-lift">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                <h4 className="text-2xl font-bold">
                  {stat.isCount ? stat.value : formatINR(stat.value)}
                </h4>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {user?.referralCode ? (
        <Card className="mb-8 border-primary/20 bg-card/80">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Invite members</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Share your referral code so new members join under you. Qualified directs with an active plan:{" "}
                  <strong className="text-foreground">{user.qualifiedDirectReferrals ?? 0}</strong>.
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                  Invite link:{" "}
                  <span className="text-foreground">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/register?ref=${user.referralCode}`
                      : ""}
                  </span>
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                const link = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/register?ref=${user.referralCode}`;
                void navigator.clipboard.writeText(link).then(() => toast.success("Invite link copied"));
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy invite link
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h3 className="font-display font-bold text-lg">Recent Investments</h3>
              <Link href="/investments" className="text-sm text-primary hover:underline">View All</Link>
            </div>
            <div className="p-0">
              {investments && investments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary/30 text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4 font-medium">Plan</th>
                        <th className="px-6 py-4 font-medium">Amount</th>
                        <th className="px-6 py-4 font-medium">Progress</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {investments.slice(0, 5).map(inv => (
                        <tr key={inv.id} className="hover:bg-secondary/10">
                          <td className="px-6 py-4 font-medium">{inv.planName}</td>
                          <td className="px-6 py-4">{formatINR(inv.amount)}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 w-full max-w-[120px]">
                              <div className="flex justify-between text-xs">
                                <span>{Math.round((inv.totalEarned / inv.maxReturn) * 100)}%</span>
                              </div>
                              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-primary h-full rounded-full" 
                                  style={{ width: `${Math.min(100, (inv.totalEarned / inv.maxReturn) * 100)}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={inv.isActive ? "success" : "default"}>
                              {inv.isActive ? "Active" : "Completed"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>You haven't made any investments yet.</p>
                  <Link href="/plans"><Button className="mt-4">Explore Plans</Button></Link>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div>
          <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-8 relative z-10">
              <Wallet className="h-10 w-10 mb-6 opacity-80" />
              <p className="text-primary-foreground/80 font-medium mb-1">Available Balance</p>
              <h3 className="text-4xl font-display font-bold mb-8">{formatINR(stats?.walletBalance || 0)}</h3>
              <Link href="/withdraw">
                <Button className="w-full bg-white text-primary hover:bg-white/90">
                  Withdraw Funds
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
