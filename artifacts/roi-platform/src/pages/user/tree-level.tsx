import { AppLayout } from "@/components/layout/app-layout";
import { BinaryTreeChart } from "@/components/binary-tree-chart";
import { getGetMyBinaryTreeQueryOptions, useGetMyBinaryTree } from "@workspace/api-client-react";
import { Card, Button } from "@/components/ui/core";
import { GitBranch, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useState } from "react";

const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const ZOOM_STEPS = [0.65, 0.8, 1, 1.15, 1.3] as const;

export default function TreeLevel() {
  const [maxDepth, setMaxDepth] = useState(5);
  const [zoomIndex, setZoomIndex] = useState(2);
  const scale = ZOOM_STEPS[zoomIndex] ?? 1;

  const { data, isLoading, isError } = useGetMyBinaryTree(
    { maxDepth },
    { query: { ...getGetMyBinaryTreeQueryOptions({ maxDepth }), staleTime: 120_000 } },
  );

  const root = data?.root;

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold flex items-center gap-2">
            <GitBranch className="h-8 w-8 text-primary" />
            Binary tree
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Left and right leg placement for Smart Binary. For referral sponsor genealogy (investment / level income),
            open <strong className="text-foreground">Investment team tree</strong> in the menu.
          </p>
        </div>
      </div>

      <Card className="p-4 md:p-6 mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Levels below you</span>
            {DEPTH_OPTIONS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={maxDepth === d ? "default" : "outline"}
                onClick={() => setMaxDepth(d)}
                title={`Show ${d} level${d === 1 ? "" : "s"} below you`}
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
              title="Reset zoom and depth"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading binary tree…</div>
        ) : isError ? (
          <div className="py-12 text-center text-destructive">Could not load tree.</div>
        ) : !root ? (
          <div className="py-12 text-center text-muted-foreground">No tree data.</div>
        ) : (
          <div className="space-y-4">
            <BinaryTreeChart root={root} rootLabel="You (root)" scale={scale} />
            <p className="text-xs text-muted-foreground text-center">
              Showing up to <strong className="text-foreground">{data?.maxDepth ?? maxDepth}</strong> levels below you.
              Cards are tagged <strong className="text-foreground">L1, L2…</strong> for each generation under you.
            </p>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
