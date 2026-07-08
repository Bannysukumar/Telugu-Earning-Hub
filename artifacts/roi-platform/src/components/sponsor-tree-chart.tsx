import type { SponsorTreeNode } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/core";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NODE_W = "w-[240px] shrink-0";
const CHILD_SLOT_W = "w-[252px] shrink-0";
const SIBLING_GAP = "gap-10 md:gap-14";
const LINE = "bg-primary/50 dark:bg-primary/40";

function VLine({ className, h = "h-6" }: { className?: string; h?: string }) {
  return <div className={cn("w-[2px] shrink-0", h, LINE, className)} aria-hidden />;
}

function HBar({ count }: { count: number }) {
  if (count <= 1) return null;
  const inset = `${50 / count}%`;
  return (
    <div
      className={cn("pointer-events-none absolute top-0 h-[2px]", LINE)}
      style={{ left: inset, right: inset }}
      aria-hidden
    />
  );
}

function MemberCard({ node, isRoot, level }: { node: SponsorTreeNode; isRoot?: boolean; level: number }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-3 shadow-sm",
        NODE_W,
        isRoot ? "ring-1 ring-primary/25" : "",
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug break-words text-center flex-1">{node.name}</p>
          {level > 0 ? (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 tabular-nums shrink-0">
              L{level}
            </Badge>
          ) : null}
        </div>
        {node.referralCode ? (
          <p className="text-[10px] text-center text-muted-foreground font-mono">{node.referralCode}</p>
        ) : null}
        <p className="text-[10px] leading-tight text-muted-foreground font-mono break-all text-center">{node.id}</p>
        <div className="flex flex-wrap justify-center gap-1 pt-1">
          {node.hasActivatedInvestment ? (
            <Badge variant="success" className="text-[10px]">
              Active{node.activeInvestmentsCount > 0 ? ` (${node.activeInvestmentsCount})` : ""}
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px]">
              No plan
            </Badge>
          )}
          {node.totalInvested > 0 ? (
            <Badge variant="outline" className="text-[10px] tabular-nums">
              {formatINR(node.totalInvested)}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChildRow({ nodes, level }: { nodes: SponsorTreeNode[]; level: number }) {
  if (nodes.length === 0) return null;
  return (
    <div className="flex flex-col items-center w-max max-w-none mx-auto">
      <VLine className="-mb-px" />
      <div className={cn("relative flex flex-row flex-nowrap items-start justify-center w-max", SIBLING_GAP)}>
        <HBar count={nodes.length} />
        {nodes.map((child) => (
          <div key={child.id} className={cn("flex flex-col items-center", CHILD_SLOT_W)}>
            <VLine className="-mt-px -mb-px" h="h-5" />
            <TreeNode node={child} level={level} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeNode({ node, level }: { node: SponsorTreeNode; level: number }) {
  const children = node.children ?? [];
  return (
    <div className="flex flex-col items-center py-1">
      <MemberCard node={node} isRoot={level === 0} level={level} />
      {children.length > 0 ? <ChildRow nodes={children} level={level + 1} /> : null}
    </div>
  );
}

export type SponsorTreeChartProps = {
  root: SponsorTreeNode;
  rootLabel?: string;
  scale?: number;
};

export function SponsorTreeChart({ root, rootLabel = "You (root)", scale = 1 }: SponsorTreeChartProps) {
  return (
    <div className="overflow-auto max-h-[min(78vh,calc(100vh-10rem))] rounded-xl border border-border/60 bg-muted/10 p-2">
      <div
        className="inline-flex min-w-max justify-center p-6 md:p-10 transition-transform duration-200"
        style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
      >
        <div className="flex flex-col items-center">
          <p className="text-xs text-muted-foreground mb-3 font-medium">{rootLabel}</p>
          <TreeNode node={root} level={0} />
        </div>
      </div>
    </div>
  );
}
