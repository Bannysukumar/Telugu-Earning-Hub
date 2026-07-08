import { AppLayout } from "@/components/layout/app-layout";
import { getGetMyDirectLevelQueryOptions, useGetMyDirectLevel } from "@workspace/api-client-react";
import { Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge } from "@/components/ui/core";
import { formatINR, formatDate } from "@/lib/utils";
import { usePlatformFeatures } from "@/hooks/use-platform-features";
import { UserPlus } from "lucide-react";

export default function DirectLevel() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  const { data, isLoading, isError } = useGetMyDirectLevel({
    query: { ...getGetMyDirectLevelQueryOptions(), staleTime: 120_000 },
  });

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold flex items-center gap-2">
          <UserPlus className="h-8 w-8 text-primary" />
          Direct level
        </h2>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Members who signed up with your referral link (your direct referrals).
        </p>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-muted-foreground">Loading your directs…</div>
        ) : isError ? (
          <div className="p-8 text-destructive">Could not load direct referrals.</div>
        ) : !data?.directs?.length ? (
          <div className="p-8 text-center text-muted-foreground">
            No direct referrals yet. Share your invite link from the dashboard to grow your team.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Code</TableHead>
                  {binaryPlanEnabled ? <TableHead>Binary leg</TableHead> : null}
                  <TableHead>Joined</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Invested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.directs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="font-mono text-sm">{row.referralCode ?? "—"}</TableCell>
                    {binaryPlanEnabled ? (
                      <TableCell>
                        {row.binarySide ? (
                          <Badge variant="outline">{row.binarySide === "left" ? "Left" : "Right"}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      {row.hasActivatedInvestment ? (
                        <Badge variant="success">
                          Active {row.activeInvestmentsCount > 0 ? `(${row.activeInvestmentsCount})` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="warning">Not activated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(row.totalInvested)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
