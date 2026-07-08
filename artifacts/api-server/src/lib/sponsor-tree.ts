import {
  listDirectReferralsByReferrerId,
  listDirectReferralsByReferrerIds,
  listInvestmentsByUserIds,
  toIso,
  type UserDoc,
} from "./firestore-db.js";

export type SponsorTreeJson = {
  id: string;
  name: string;
  referralCode: string | null;
  hasActivatedInvestment: boolean;
  activeInvestmentsCount: number;
  totalInvested: number;
  children: SponsorTreeJson[];
};

/** Unilevel genealogy by direct sponsor (`referrerId`) — used for investment-plan team view. */
export async function buildSponsorTreeJson(
  rootUser: UserDoc & { id: string },
  maxDepth: number,
): Promise<SponsorTreeJson> {
  type UserRow = UserDoc & { id: string };
  const usersById = new Map<string, UserRow>([[rootUser.id, rootUser]]);
  const childrenByParent = new Map<string, UserRow[]>();

  const sortByCreated = (a: UserRow, b: UserRow) => toIso(a.createdAt).localeCompare(toIso(b.createdAt));

  const rootDirects = await listDirectReferralsByReferrerId(rootUser.id);
  for (const d of rootDirects) usersById.set(d.id, d);
  childrenByParent.set(
    rootUser.id,
    [...rootDirects].sort(sortByCreated),
  );

  let frontier = rootDirects.map((d) => d.id);
  for (let level = 1; level < maxDepth && frontier.length > 0; level++) {
    const kids = await listDirectReferralsByReferrerIds(frontier);
    const nextFrontier: string[] = [];
    for (const kid of kids) {
      const parentId = kid.referrerId?.trim();
      if (!parentId || !usersById.has(parentId)) continue;
      usersById.set(kid.id, kid);
      const arr = childrenByParent.get(parentId) ?? [];
      if (!arr.some((r) => r.id === kid.id)) arr.push(kid);
      childrenByParent.set(parentId, arr);
      nextFrontier.push(kid.id);
    }
    frontier = nextFrontier;
  }

  for (const arr of childrenByParent.values()) {
    arr.sort(sortByCreated);
  }

  const invByUser = await listInvestmentsByUserIds([...usersById.keys()]);

  function stats(userId: string) {
    const invs = invByUser.get(userId) ?? [];
    return {
      hasActivatedInvestment: invs.length > 0,
      activeInvestmentsCount: invs.filter((i) => i.isActive).length,
      totalInvested: invs.reduce((acc, i) => acc + i.amount, 0),
    };
  }

  function assemble(userId: string, depth: number): SponsorTreeJson {
    const u = usersById.get(userId)!;
    const childRows = depth < maxDepth ? (childrenByParent.get(userId) ?? []) : [];
    return {
      id: u.id,
      name: u.name,
      referralCode: u.referralCode ?? null,
      ...stats(u.id),
      children: childRows.map((c) => assemble(c.id, depth + 1)),
    };
  }

  return assemble(rootUser.id, 0);
}
