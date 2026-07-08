import { AppLayout } from "@/components/layout/app-layout";
import { SponsorTreeChart } from "@/components/sponsor-tree-chart";
import {
  getAdminGetUserSponsorTreeQueryOptions,
  useAdminGetUserSponsorTree,
  useAdminGetUsers,
} from "@workspace/api-client-react";
import { Card, Button, Label } from "@/components/ui/core";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformFeatures } from "@/hooks/use-platform-features";
import { Layers, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";

const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const ZOOM_STEPS = [0.65, 0.8, 1, 1.15, 1.3] as const;

export default function AdminInvestmentTreeLevel() {
  const { binaryPlanEnabled } = usePlatformFeatures();
  const { user: authUser } = useAuth();
  const { data: users } = useAdminGetUsers();
  const [maxDepth, setMaxDepth] = useState(5);
  const [zoomIndex, setZoomIndex] = useState(2);
  const scale = ZOOM_STEPS[zoomIndex] ?? 1;
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    if (!selectedUserId && authUser?.id) {
      setSelectedUserId(authUser.id);
    }
  }, [authUser?.id, selectedUserId]);

  const selectedUser = useMemo(
    () => users?.find((u) => u.id === selectedUserId),
    [users, selectedUserId],
  );

  const { data, isLoading, isError } = useAdminGetUserSponsorTree(
    selectedUserId,
    { maxDepth },
    {
      query: {
        ...getAdminGetUserSponsorTreeQueryOptions(selectedUserId, { maxDepth }),
        enabled: Boolean(selectedUserId),
        staleTime: 60_000,
      },
    },
  );

  const root = data?.root;
  const directCount = root?.children?.length ?? 0;

  return (
    <AppLayout isAdmin>
      <div className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            Investment team tree
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Unilevel genealogy by referral sponsor — for investment plans, level income, and direct team growth.
            {binaryPlanEnabled ? (
              <>
                {" "}
                For left/right leg placement, use{" "}
                <Link href="/admin/tree-level" className="text-primary hover:underline font-medium">
                  Binary tree
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      </div>

      <Card className="p-4 md:p-6 mb-4 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Levels</span>
            {DEPTH_OPTIONS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={maxDepth === d ? "default" : "outline"}
                onClick={() => setMaxDepth(d)}
              >
                {d}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Zoom</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoomIndex <= 0}
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoomIndex >= ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setZoomIndex(2);
                setMaxDepth(5);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
        <div className="space-y-1 max-w-md">
          <Label className="text-xs">Root member</Label>
          <select
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select user…</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
        {selectedUser && root ? (
          <p className="text-sm text-muted-foreground">
            Direct referrals under root: <strong className="text-foreground">{directCount}</strong>
          </p>
        ) : null}
      </Card>

      <Card className="p-4 md:p-6">
        {!selectedUserId ? (
          <div className="py-12 text-center text-muted-foreground">Select a user to load their team tree.</div>
        ) : isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading team tree…</div>
        ) : isError ? (
          <div className="py-12 text-center text-destructive">Could not load team tree.</div>
        ) : !root ? (
          <div className="py-12 text-center text-muted-foreground">No tree data for this member.</div>
        ) : (
          <div className="space-y-4">
            <SponsorTreeChart
              root={root}
              rootLabel={selectedUser ? `${selectedUser.name} (root)` : "Root"}
              scale={scale}
            />
            <p className="text-xs text-muted-foreground text-center">
              Showing up to <strong className="text-foreground">{data?.maxDepth ?? maxDepth}</strong> sponsor levels
              below {selectedUser?.name ?? "this member"}.
            </p>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
