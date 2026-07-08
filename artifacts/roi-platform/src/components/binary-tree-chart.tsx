import type { BinaryTreeNode } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/core";
import { cn } from "@/lib/utils";
import { useMemo, type ReactNode } from "react";

const NODE_W = "w-[240px] shrink-0";
const CHILD_SLOT_W = "w-[252px] shrink-0";
const LEG_COL_MIN = "min-w-[280px] shrink-0";
const SIBLING_GAP = "gap-10 md:gap-14";
const TEAM_GAP = "gap-12 md:gap-20";
const LINE = "bg-primary/50 dark:bg-primary/40";

type LegacyBinaryTreeNode = BinaryTreeNode & {
  left?: BinaryTreeNode | null;
  right?: BinaryTreeNode | null;
};

/** Support older API payloads that used single `left` / `right` instead of `leftTeam` / `rightTeam`. */
export function normalizeBinaryTreeNode(node: BinaryTreeNode): BinaryTreeNode {
  const legacy = node as LegacyBinaryTreeNode;
  const leftTeam = (
    node.leftTeam?.length ? node.leftTeam : legacy.left ? [legacy.left] : []
  ).map(normalizeBinaryTreeNode);
  const rightTeam = (
    node.rightTeam?.length ? node.rightTeam : legacy.right ? [legacy.right] : []
  ).map(normalizeBinaryTreeNode);
  return {
    id: node.id,
    name: node.name,
    binarySide: node.binarySide,
    leftTeam,
    rightTeam,
  };
}

function EmptyLeg() {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/80 bg-muted/25 px-3 py-8 text-center text-xs text-muted-foreground",
        NODE_W,
      )}
    >
      Empty slot
    </div>
  );
}

/** Vertical segment; overlaps adjacent segments by 1px so joints look continuous. */
function VLine({ className, h = "h-6" }: { className?: string; h?: string }) {
  return <div className={cn("w-[2px] shrink-0", h, LINE, className)} aria-hidden />;
}

/** Horizontal bar spanning between first and last child centers in a flex row of `count` items. */
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

function TreeMemberCard({
  node,
  isRoot,
  level,
}: {
  node: BinaryTreeNode;
  isRoot?: boolean;
  level: number;
}) {
  const side = node.binarySide;
  const sideLabel =
    !isRoot && (side === "left" || side === "right") ? (side === "left" ? "Left leg" : "Right leg") : null;

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
          <div className="flex flex-col items-end gap-1 shrink-0">
            {level > 0 ? (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 tabular-nums">
                L{level}
              </Badge>
            ) : null}
            {sideLabel ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  side === "left"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    : "border-sky-500/40 text-sky-700 dark:text-sky-400",
                )}
              >
                {sideLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="text-[10px] leading-tight text-muted-foreground font-mono break-all text-center">{node.id}</p>
      </div>
    </div>
  );
}

/** Row of child subtrees with shared top horizontal connector. */
function ChildRow({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  const count = items.length;
  if (count === 0) return null;

  return (
    <div className="flex flex-col items-center w-max max-w-none mx-auto">
      <VLine className="-mb-px" />
      <div
        className={cn(
          "relative flex flex-row flex-nowrap items-start justify-center w-max",
          SIBLING_GAP,
        )}
      >
        <HBar count={count} />
        {items.map((child, i) => (
          <div key={i} className={cn("flex flex-col items-center", CHILD_SLOT_W)}>
            <VLine className="-mt-px -mb-px" h="h-5" />
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

function LegColumn({
  label,
  members,
  accent,
  level,
}: {
  label: string;
  members: BinaryTreeNode[];
  accent: "left" | "right";
  level: number;
}) {
  const labelClass =
    accent === "left" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400";

  return (
    <div className={cn("flex flex-col items-center px-4 md:px-6", LEG_COL_MIN)}>
      <VLine className="-mt-px -mb-px" h="h-5" />
      <span className={cn("text-[10px] font-semibold uppercase tracking-wider mb-2", labelClass)}>{label}</span>
      {members.length === 0 ? (
        <EmptyLeg />
      ) : (
        <ChildRow>
          {members.map((m) => (
            <TreeNode key={m.id} node={m} level={level} />
          ))}
        </ChildRow>
      )}
    </div>
  );
}

function TreeNode({ node, level }: { node: BinaryTreeNode; level: number }) {
  const leftTeam = node.leftTeam ?? [];
  const rightTeam = node.rightTeam ?? [];
  const hasDownline = leftTeam.length > 0 || rightTeam.length > 0;

  return (
    <div className="flex flex-col items-center py-1">
      <TreeMemberCard node={node} isRoot={level === 0} level={level} />
      {hasDownline ? (
        <div className="flex flex-col items-center w-full">
          <VLine className="-mb-px" />
          <div
            className={cn(
              "relative flex flex-row flex-nowrap w-max max-w-none mx-auto items-start justify-center px-2",
              TEAM_GAP,
            )}
          >
            {leftTeam.length > 0 && rightTeam.length > 0 ? (
              <div
                className={cn("pointer-events-none absolute top-0 h-[2px]", LINE)}
                style={{ left: "25%", right: "25%" }}
                aria-hidden
              />
            ) : null}
            {leftTeam.length > 0 ? (
              <LegColumn label="Left" members={leftTeam} accent="left" level={level + 1} />
            ) : null}
            {rightTeam.length > 0 ? (
              <LegColumn label="Right" members={rightTeam} accent="right" level={level + 1} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RootTeams({ node, level }: { node: BinaryTreeNode; level: number }) {
  const leftTeam = node.leftTeam ?? [];
  const rightTeam = node.rightTeam ?? [];
  const hasTeams = leftTeam.length > 0 || rightTeam.length > 0;
  if (!hasTeams) return null;

  return (
    <div className="flex flex-col items-center w-max max-w-none">
      <VLine className="-mb-px" h="h-7" />
      <div
        className={cn(
          "relative flex flex-row flex-nowrap w-max max-w-none mx-auto items-start justify-center px-4",
          TEAM_GAP,
        )}
      >
        {leftTeam.length > 0 && rightTeam.length > 0 ? (
          <div
            className={cn("pointer-events-none absolute top-0 h-[2px]", LINE)}
            style={{ left: "25%", right: "25%" }}
            aria-hidden
          />
        ) : null}
        {leftTeam.length > 0 ? (
          <LegColumn label="Left team (your directs)" members={leftTeam} accent="left" level={level + 1} />
        ) : null}
        {rightTeam.length > 0 ? (
          <LegColumn label="Right team (your directs)" members={rightTeam} accent="right" level={level + 1} />
        ) : null}
      </div>
    </div>
  );
}

export type BinaryTreeChartProps = {
  root: BinaryTreeNode;
  rootLabel?: string;
  /** CSS transform scale for zoom (0.5–1.5). */
  scale?: number;
};

export function BinaryTreeChart({ root, rootLabel = "You (root)", scale = 1 }: BinaryTreeChartProps) {
  const normalized = useMemo(() => normalizeBinaryTreeNode(root), [root]);

  return (
    <div className="overflow-auto max-h-[min(78vh,calc(100vh-10rem))] rounded-xl border border-border/60 bg-muted/10 p-2">
      <div
        className="inline-flex min-w-max justify-center p-6 md:p-10 transition-transform duration-200"
        style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
      >
        <div className="flex flex-col items-center">
          <p className="text-xs text-muted-foreground mb-3 font-medium">{rootLabel}</p>
          <TreeMemberCard node={normalized} isRoot level={0} />
          <RootTeams node={normalized} level={0} />
        </div>
      </div>
    </div>
  );
}
