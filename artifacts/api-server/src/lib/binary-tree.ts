import {
  listDirectReferralsByReferrerId,
  listDirectReferralsByReferrerIds,
  toIso,
  type UserDoc,
} from "./firestore-db.js";

export type BinaryTreeJson = {
  id: string;
  name: string;
  binarySide: "left" | "right" | null;
  leftTeam: BinaryTreeJson[];
  rightTeam: BinaryTreeJson[];
};

/** Load tree by direct sponsor (`referrerId`) — same members as Direct level. */
export async function buildBinaryTreeJson(
  rootUser: UserDoc & { id: string },
  maxDepth: number,
): Promise<BinaryTreeJson> {
  type UserRow = UserDoc & { id: string };
  const usersById = new Map<string, UserRow>([[rootUser.id, rootUser]]);
  const childrenByParent = new Map<string, { left: UserRow[]; right: UserRow[] }>();

  const sortByCreated = (a: UserRow, b: UserRow) => toIso(a.createdAt).localeCompare(toIso(b.createdAt));

  const pushChild = (parentId: string, kid: UserRow) => {
    let slot = childrenByParent.get(parentId);
    if (!slot) {
      slot = { left: [], right: [] };
      childrenByParent.set(parentId, slot);
    }
    if (kid.binarySide === "left" && !slot.left.some((r) => r.id === kid.id)) slot.left.push(kid);
    else if (kid.binarySide === "right" && !slot.right.some((r) => r.id === kid.id)) slot.right.push(kid);
  };

  const rootDirects = await listDirectReferralsByReferrerId(rootUser.id);
  for (const d of rootDirects) {
    usersById.set(d.id, d);
    pushChild(rootUser.id, d);
  }

  let frontier = rootDirects.map((d) => d.id);
  for (let level = 0; level < maxDepth - 1 && frontier.length > 0; level++) {
    const kids = await listDirectReferralsByReferrerIds(frontier);
    const nextFrontier: string[] = [];
    for (const kid of kids) {
      usersById.set(kid.id, kid);
      nextFrontier.push(kid.id);
      const parentId = kid.referrerId;
      if (!parentId || parentId === rootUser.id) continue;
      if (rootDirects.some((d) => d.id === kid.id)) continue;
      pushChild(parentId, kid);
    }
    frontier = nextFrontier;
  }

  for (const [parentId, slot] of childrenByParent) {
    if (parentId === rootUser.id) continue;
    slot.left = slot.left.filter((u) => u.referrerId !== rootUser.id);
    slot.right = slot.right.filter((u) => u.referrerId !== rootUser.id);
  }

  for (const slot of childrenByParent.values()) {
    slot.left.sort(sortByCreated);
    slot.right.sort(sortByCreated);
  }

  function leafNode(u: UserRow, side: "left" | "right"): BinaryTreeJson {
    return {
      id: u.id,
      name: u.name,
      binarySide: side,
      leftTeam: [],
      rightTeam: [],
    };
  }

  function assemble(userId: string, depth: number): BinaryTreeJson {
    const u = usersById.get(userId)!;
    const slot = childrenByParent.get(userId) ?? { left: [], right: [] };
    const node: BinaryTreeJson = {
      id: u.id,
      name: u.name,
      binarySide:
        depth === 0 ? null : u.binarySide === "left" || u.binarySide === "right" ? u.binarySide : null,
      leftTeam: [],
      rightTeam: [],
    };
    if (depth >= maxDepth) {
      node.leftTeam = slot.left.map((r) => leafNode(r, "left"));
      node.rightTeam = slot.right.map((r) => leafNode(r, "right"));
      return node;
    }
    node.leftTeam = slot.left.map((r) => assemble(r.id, depth + 1));
    node.rightTeam = slot.right.map((r) => assemble(r.id, depth + 1));
    return node;
  }

  return assemble(rootUser.id, 0);
}
