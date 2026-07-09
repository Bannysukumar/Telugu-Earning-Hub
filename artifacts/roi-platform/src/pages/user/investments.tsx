import { AppLayout } from "@/components/layout/app-layout";
import { useGetMyInvestments } from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { Activity, Clock, Plus, Target } from "lucide-react";

export default function Investments() {
  const { data: investments, isLoading } = useGetMyInvestments();

  if (isLoading) return <AppLayout><div className="p-8">Loading...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-display font-bold">My Investments</h2>
          <p className="text-muted-foreground">
            Each card is one position. ROI, level income, and other bonuses count toward that position&apos;s cap. You can activate the same plan again from{" "}
            <Link href="/plans" className="text-primary hover:underline">
              Investment plans
            </Link>
            .
          </p>
        </div>
        <Link href="/plans">
          <Button><Plus className="h-4 w-4 mr-2"/> New Investment</Button>
        </Link>
      </div>

      {investments?.length === 0 ? (
        <Card className="p-16 text-center border-dashed">
          <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-xl font-bold mb-2">No investments yet</h3>
          <p className="text-muted-foreground mb-6">Start earning daily ROI by investing in a plan today.</p>
          <Link href="/plans"><Button>Browse Plans</Button></Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {investments?.map(inv => {
            const progress = Math.min(100, (inv.totalEarned / inv.maxReturn) * 100);
            return (
              <Card key={inv.id} className="relative overflow-hidden group hover:border-primary/50 transition-colors">
                {inv.isActive && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-cyan-400" />}
                
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{inv.planName}</h3>
                      <p className="text-sm text-muted-foreground">Started {formatDate(inv.startDate).split(',')[0]}</p>
                    </div>
                    <Badge variant={inv.isActive ? "success" : "default"}>
                      {inv.status === "active"
                        ? "Active"
                        : inv.status === "manually_stopped"
                          ? "Manual stop"
                          : "Completed"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-secondary/50 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">Invested</p>
                      <p className="font-semibold">{formatINR(inv.amount)}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-1">Earned So Far</p>
                      <p className="font-semibold text-emerald-400">{formatINR(inv.totalEarned)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress ({inv.daysCompleted}/{inv.maxDays} days)</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border">
                    <span className="flex items-center gap-1"><Activity className="h-3 w-3"/> {formatINR(inv.dailyRoi)}/day</span>
                    <span className="flex items-center gap-1"><Target className="h-3 w-3"/> Max {formatINR(inv.maxReturn)}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
