/** Pure direct-binary pairing math (no Firestore). */

export type BinaryAncestorStep = { ancestorId: string; side: "left" | "right" };

export type DirectBinaryMember = {
  binaryParentId?: string | null;
  referrerId?: string | null;
  binarySide?: "left" | "right" | null;
};

/**
 * Direct binary only: leg volume applies to the member's immediate binary parent (one left / one right slot).
 * Downline team volume does not propagate up for pairing — no level binary income.
 */
export function resolveDirectBinarySteps(user: DirectBinaryMember): BinaryAncestorStep[] {
  const parentId = String(user.binaryParentId ?? user.referrerId ?? "").trim();
  if (!parentId) return [];
  if (user.binarySide !== "left" && user.binarySide !== "right") return [];
  return [{ ancestorId: parentId, side: user.binarySide }];
}

export function simulateBinaryPayouts(
  chain: BinaryAncestorStep[],
  M: number,
  bvStart: Map<string, { L: number; R: number }>,
  headroomByUser: Map<string, number>,
  pairUnit: number,
  pairPayout: number,
): { finalBv: Map<string, { L: number; R: number }>; binaryPayoutByUser: Map<string, number> } {
  const unit = Math.max(1, pairUnit);
  const bv = new Map<string, { L: number; R: number }>();
  for (const [k, v] of bvStart) bv.set(k, { ...v });
  const binaryPayoutByUser = new Map<string, number>();
  const remainingCap = new Map(headroomByUser);

  for (const step of chain) {
    const st = bv.get(step.ancestorId);
    if (!st) continue;
    if (step.side === "left") st.L += M;
    else st.R += M;

    const pairsPossible = Math.min(Math.floor(st.L / unit), Math.floor(st.R / unit));
    const capLeft = remainingCap.get(step.ancestorId) ?? 0;
    // Only consume BV for pairs we can actually pay (cap + payout > 0).
    const pairsByCap =
      pairPayout > 0 ? Math.min(pairsPossible, Math.floor(capLeft / pairPayout)) : 0;
    const pairs = Math.max(0, pairsByCap);
    const pay = pairs * pairPayout;
    st.L -= pairs * unit;
    st.R -= pairs * unit;

    if (pay > 0) {
      remainingCap.set(step.ancestorId, capLeft - pay);
      binaryPayoutByUser.set(step.ancestorId, (binaryPayoutByUser.get(step.ancestorId) ?? 0) + pay);
    }
  }

  return { finalBv: bv, binaryPayoutByUser };
}
