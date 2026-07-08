import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  db,
  getUser,
  normalizeInvestmentFields,
  toIso,
  GLOBAL_SETTINGS_DOC_ID,
  peerTransferFeePercentFromSettingsData,
  binaryPlanEnabledFromSettingsData,
  directIncomeEnabledFromSettingsData,
  getBinaryPlanEnabled,
  computeInvestmentIsActive,
  type ManualStatus,
  type PlanDoc,
  type UserDoc,
} from "./firestore-db.js";
import { patchAfterEarningsCredit, investmentCapHeadroom } from "./investment-cap.js";
import {
  resolveDirectBinarySteps,
  simulateBinaryPayouts,
  type BinaryAncestorStep,
} from "./binary-pair-logic.js";

export { resolveDirectBinarySteps, simulateBinaryPayouts, type BinaryAncestorStep } from "./binary-pair-logic.js";

export const DEFAULT_PLAN_DIRECT_BONUS = 20;
export const DEFAULT_BINARY_PAIR_VOLUME = 200;
export const DEFAULT_BINARY_PAIR_PAYOUT = 80;
export const DEFAULT_ROI_POOL_PERCENT = 100;

export function resolvedDirectBonus(plan: PlanDoc): number {
  const n = plan.directBonus;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : DEFAULT_PLAN_DIRECT_BONUS;
}

export function resolvedBinaryPairVolume(plan: PlanDoc): number {
  const n = plan.binaryPairVolume;
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_BINARY_PAIR_VOLUME;
  return Math.max(1, v);
}

export function resolvedBinaryPairPayout(plan: PlanDoc): number {
  const n = plan.binaryPairPayout;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : DEFAULT_BINARY_PAIR_PAYOUT;
}

export function resolvedRoiPoolPercent(plan: PlanDoc): number {
  const n = plan.roiPoolPercent;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_ROI_POOL_PERCENT;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function resolvedLevelIncomeEnabled(plan: PlanDoc): boolean {
  if (isStandalonePlan(plan)) return false;
  return plan.levelIncomeEnabled === true;
}

export function levelIncomeAmountFromRoiPayout(roiPayout: number, percent: number): number {
  if (roiPayout <= 0 || percent <= 0) return 0;
  return Math.round((roiPayout * percent) / 100);
}

/** Referrer chain (level 1 = direct sponsor), oldest sponsor last. */
export async function buildReferrerUplineIds(startUserId: string, maxHops: number): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<string>([startUserId]);
  let current = await getUser(startUserId);
  let hops = 0;
  while (current?.referrerId && hops < maxHops) {
    const rid = current.referrerId;
    if (!rid || seen.has(rid)) break;
    seen.add(rid);
    chain.push(rid);
    current = await getUser(rid);
    hops++;
  }
  return chain;
}

export function isStandalonePlan(plan: PlanDoc): boolean {
  return plan.planKind === "standalone";
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomReferralFragment(): string {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += REF_ALPHABET[bytes[i]! % REF_ALPHABET.length]!;
  }
  return s;
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const c = randomReferralFragment();
    const snap = await db.collection("users").where("referralCode", "==", c).limit(1).get();
    if (snap.empty) return c;
  }
  throw new Error("Could not allocate referral code");
}

export async function findReferrerByCode(code: string): Promise<(UserDoc & { id: string }) | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length > 32) return null;
  const snap = await db.collection("users").where("referralCode", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return { id: doc.id, ...(doc.data() as UserDoc) };
}

export async function listUsersWithBinaryParent(parentId: string): Promise<(UserDoc & { id: string })[]> {
  const snap = await db.collection("users").where("binaryParentId", "==", parentId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as UserDoc) }))
    .sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

/**
 * Always place directly under the sponsor on the chosen leg (unlimited per side).
 * Downline spill is not used for signup placement.
 */
export async function resolveBinaryPlacementForSignup(
  sponsorId: string,
  preferredSide: "left" | "right",
): Promise<{ parentId: string; side: "left" | "right" }> {
  return { parentId: sponsorId, side: preferredSide };
}

/** Breadth-first spill: first free left under sponsor subtree, else right, else deeper. */
export async function findBinaryPlacementForNewMember(sponsorId: string): Promise<{ parentId: string; side: "left" | "right" }> {
  const queue: string[] = [sponsorId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const kids = await listUsersWithBinaryParent(id);
    const left = kids.find((k) => k.binarySide === "left");
    const right = kids.find((k) => k.binarySide === "right");
    if (!left) return { parentId: id, side: "left" };
    if (!right) return { parentId: id, side: "right" };
    queue.push(left.id, right.id);
  }
  return { parentId: sponsorId, side: "left" };
}

/** @deprecated Payouts use {@link resolveDirectBinarySteps} only. Kept for diagnostics / legacy tooling. */
export async function buildBinaryAncestorChain(userId: string): Promise<BinaryAncestorStep[]> {
  const u = await getUser(userId);
  if (!u) return [];
  return resolveDirectBinarySteps(u);
}

function sumInvestmentHeadroomFromDocs(docs: QueryDocumentSnapshot[]): number {
  let s = 0;
  for (const d of docs) {
    const inv = normalizeInvestmentFields(d.id, d.data()!);
    if (!inv.isActive) continue;
    s += investmentCapHeadroom(inv.totalEarned, inv.maxReturn);
  }
  return s;
}

/** Total remaining cap across active investments (ROI + level income + other MLM share this pool). */
export async function sumUserInvestmentHeadroom(userId: string): Promise<number> {
  const snap = await db.collection("investments").where("userId", "==", userId).get();
  return sumInvestmentHeadroomFromDocs(snap.docs);
}

type InvWork = { ref: DocumentReference; maxReturn: number; totalEarned: number; id: string };

function buildInvWorkList(docs: QueryDocumentSnapshot[]): InvWork[] {
  return docs
    .map((d) => {
      const inv = normalizeInvestmentFields(d.id, d.data()!);
      return { ref: d.ref, maxReturn: inv.maxReturn, totalEarned: inv.totalEarned, id: inv.id, createdAt: inv.createdAt, isActive: inv.isActive };
    })
    .filter((i) => i.isActive && i.totalEarned < i.maxReturn)
    .sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)))
    .map(({ ref, maxReturn, totalEarned, id }) => ({ ref, maxReturn, totalEarned, id }));
}

export type MlmIncomeSegmentType = "REFERRAL_BONUS" | "BINARY_PAIR" | "LEVEL_INCOME";
type Segment = { amount: number; type: MlmIncomeSegmentType; note: string };

/** Apply ordered segments against 2× headroom; returns per-investment final totalEarned and income rows. */
function allocateSegmentsOnInvs(
  invRows: InvWork[],
  segments: Segment[],
): {
  invFinalTotals: Map<string, number>;
  incomeRows: { amount: number; type: Segment["type"]; note: string; primaryInvId: string }[];
  totalCredited: number;
} {
  const working = invRows.map((r) => ({ ...r }));
  const invFinalTotals = new Map<string, number>();
  const incomeRows: { amount: number; type: Segment["type"]; note: string; primaryInvId: string }[] = [];
  let totalCredited = 0;

  for (const seg of segments) {
    let rem = seg.amount;
    if (rem <= 0) continue;
    let segApplied = 0;
    let primaryInvId = "__mlm__";
    for (const row of working) {
      if (rem <= 0) break;
      const room = row.maxReturn - row.totalEarned;
      const take = Math.min(room, rem);
      if (take <= 0) continue;
      if (segApplied === 0) primaryInvId = row.id;
      row.totalEarned += take;
      rem -= take;
      segApplied += take;
      totalCredited += take;
      invFinalTotals.set(row.id, row.totalEarned);
    }
    if (segApplied > 0) {
      incomeRows.push({
        amount: segApplied,
        type: seg.type,
        note: seg.note,
        primaryInvId,
      });
    }
  }

  return { invFinalTotals, incomeRows, totalCredited };
}

type InvWorkRow = InvWork & { manualStatus: ManualStatus };

function buildInvWorkListWithStatus(docs: QueryDocumentSnapshot[]): InvWorkRow[] {
  return docs
    .map((d) => {
      const inv = normalizeInvestmentFields(d.id, d.data()!);
      return {
        ref: d.ref,
        maxReturn: inv.maxReturn,
        totalEarned: inv.totalEarned,
        id: inv.id,
        manualStatus: inv.manualStatus,
        createdAt: inv.createdAt,
        isActive: inv.isActive,
      };
    })
    .filter((i) => i.isActive && i.totalEarned < i.maxReturn)
    .sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)))
    .map(({ ref, maxReturn, totalEarned, id, manualStatus }) => ({
      ref,
      maxReturn,
      totalEarned,
      id,
      manualStatus,
    }));
}

/**
 * Credits MLM income against active investments (2× cap) and wallet; deactivates investments at cap.
 */
export async function creditMlmSegmentsToUser(userId: string, segments: Segment[]): Promise<number> {
  if (segments.every((s) => s.amount <= 0)) return 0;

  const investmentsCol = db.collection("investments");
  const usersCol = db.collection("users");
  const incomeCol = db.collection("incomeHistory");
  const userRef = usersCol.doc(userId);

  return db.runTransaction(async (tx) => {
    const [userSnap, invSnap] = await Promise.all([tx.get(userRef), tx.get(investmentsCol.where("userId", "==", userId))]);
    if (!userSnap.exists) return 0;

    const wallet = Number((userSnap.data() as UserDoc).walletBalance ?? 0);
    const rows = buildInvWorkListWithStatus(invSnap.docs);
    const { invFinalTotals, incomeRows, totalCredited } = allocateSegmentsOnInvs(rows, segments);
    if (totalCredited <= 0) return 0;

    for (const row of rows) {
      const te = invFinalTotals.get(row.id);
      if (te === undefined) continue;
      tx.update(
        row.ref,
        patchAfterEarningsCredit(te, row.maxReturn, row.manualStatus),
      );
    }

    tx.update(userRef, {
      walletBalance: wallet + totalCredited,
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const row of incomeRows) {
      tx.set(incomeCol.doc(), {
        userId,
        investmentId: row.primaryInvId,
        amount: row.amount,
        type: row.type,
        planAmount: 0,
        dayNumber: 0,
        note: row.note,
        date: FieldValue.serverTimestamp(),
      });
    }

    return totalCredited;
  });
}

export type CreateInvestmentMlmParams = {
  /** Member who receives the investment (BV / ROI accrue to this account). */
  userId: string;
  plan: PlanDoc & { id: string };
  deductFromWallet: boolean;
  /** When set with a different uid than `userId`, debits this wallet instead (sponsored activation). */
  walletDebitUserId?: string;
};

/**
 * Creates an investment and runs MLM side-effects in one transaction:
 * optional wallet debit, first-ever-investment referral qualify + direct bonus, binary BV + pair payouts.
 * Multiple active investments per user (including duplicate planId) are allowed — each row is independent.
 */
export async function createInvestmentWithMlmAtomic(params: CreateInvestmentMlmParams): Promise<string> {
  const { userId: beneficiaryId, plan, deductFromWallet, walletDebitUserId } = params;
  const debitUserId = walletDebitUserId ?? beneficiaryId;
  const standalone = isStandalonePlan(plan);
  if (standalone && debitUserId !== beneficiaryId) {
    throw new Error("This plan can only be activated on your own account.");
  }
  const investor = await getUser(beneficiaryId);
  const binaryPlanActive = await getBinaryPlanEnabled();
  const chain = standalone || !investor || !binaryPlanActive ? [] : resolveDirectBinarySteps(investor);
  if (!investor) {
    throw new Error("User not found");
  }
  if (debitUserId !== beneficiaryId) {
    const payer = await getUser(debitUserId);
    if (!payer) {
      throw new Error("Payer not found");
    }
  }

  const investmentsCol = db.collection("investments");
  const usersCol = db.collection("users");
  const incomeCol = db.collection("incomeHistory");
  const beneficiaryRef = usersCol.doc(beneficiaryId);
  const payerRef = usersCol.doc(debitUserId);

  const settingsRef = db.collection("settings").doc(GLOBAL_SETTINGS_DOC_ID);

  return db.runTransaction(async (tx) => {
    const [payerSnap, beneficiarySnap, settingsSnap] = await Promise.all([
      tx.get(payerRef),
      tx.get(beneficiaryRef),
      tx.get(settingsRef),
    ]);
    if (!payerSnap.exists || !beneficiarySnap.exists) throw new Error("User not found");
    const payerUser = payerSnap.data() as UserDoc;
    const invUser = beneficiarySnap.data() as UserDoc;
    const payerBalance = Number(payerUser.walletBalance ?? 0);
    const isGift = deductFromWallet && debitUserId !== beneficiaryId;
    const giftFeePct = isGift ? peerTransferFeePercentFromSettingsData(settingsSnap.data()) : 0;
    const giftFeeAmount = isGift ? Math.round((plan.amount * giftFeePct) / 100) : 0;
    const walletDebitTotal = plan.amount + giftFeeAmount;
    if (deductFromWallet && payerBalance < walletDebitTotal) {
      throw new Error("Insufficient wallet balance. Please add funds to your wallet.");
    }

    const priorInvQ = investmentsCol.where("userId", "==", beneficiaryId);
    const priorInvSnap = await tx.get(priorInvQ);
    const reallyFirst = priorInvSnap.empty;

    const ancestorUserSnaps: { id: string; snap: FirebaseFirestore.DocumentSnapshot }[] = [];
    for (const step of chain) {
      const ref = usersCol.doc(step.ancestorId);
      ancestorUserSnaps.push({ id: step.ancestorId, snap: await tx.get(ref) });
    }

    let referrerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let referrerInvSnap: FirebaseFirestore.QuerySnapshot | null = null;
    if (reallyFirst && invUser.referrerId) {
      const rref = usersCol.doc(invUser.referrerId);
      referrerSnap = await tx.get(rref);
      if (referrerSnap.exists) {
        referrerInvSnap = await tx.get(investmentsCol.where("userId", "==", invUser.referrerId));
      }
    }

    const ancestorInvSnaps = new Map<string, FirebaseFirestore.QuerySnapshot>();
    for (const { id } of ancestorUserSnaps) {
      ancestorInvSnaps.set(id, await tx.get(investmentsCol.where("userId", "==", id)));
    }

    const M = plan.amount;
    const bvStart = new Map<string, { L: number; R: number }>();
    for (const { id, snap } of ancestorUserSnaps) {
      if (!snap.exists) continue;
      const d = snap.data() as UserDoc;
      bvStart.set(id, { L: Number(d.binaryLeftBV ?? 0), R: Number(d.binaryRightBV ?? 0) });
    }

    const headroomByUser = new Map<string, number>();
    for (const { id } of ancestorUserSnaps) {
      const q = ancestorInvSnaps.get(id);
      headroomByUser.set(id, q ? sumInvestmentHeadroomFromDocs(q.docs) : 0);
    }

    const roiPoolSnap = resolvedRoiPoolPercent(plan);

    const segmentsByUser = new Map<string, Segment[]>();
    const binaryPlanActiveInTx = binaryPlanEnabledFromSettingsData(settingsSnap.data());
    const directIncomeActiveInTx = directIncomeEnabledFromSettingsData(settingsSnap.data());
    if (!standalone) {
      const directBonusCap = directIncomeActiveInTx ? resolvedDirectBonus(plan) : 0;

      let bonusForReferrer = 0;
      if (directIncomeActiveInTx && reallyFirst && invUser.referrerId && referrerSnap?.exists && referrerInvSnap) {
        const head = sumInvestmentHeadroomFromDocs(referrerInvSnap.docs);
        bonusForReferrer = Math.min(directBonusCap, head);
      }

      if (binaryPlanActiveInTx) {
        const pairUnit = resolvedBinaryPairVolume(plan);
        const pairPayout = resolvedBinaryPairPayout(plan);

        const { finalBv, binaryPayoutByUser } = simulateBinaryPayouts(
          chain,
          M,
          bvStart,
          headroomByUser,
          pairUnit,
          pairPayout,
        );

        for (const [uid, pay] of binaryPayoutByUser) {
          if (pay <= 0) continue;
          const arr = segmentsByUser.get(uid) ?? [];
          arr.push({
            amount: pay,
            type: "BINARY_PAIR",
            note: `Binary pair income · direct left + right leg (${beneficiaryId} activated)`,
          });
          segmentsByUser.set(uid, arr);
        }

        for (const { id, snap } of ancestorUserSnaps) {
          if (!snap.exists) continue;
          const fin = finalBv.get(id);
          if (!fin) continue;
          tx.update(usersCol.doc(id), {
            binaryLeftBV: fin.L,
            binaryRightBV: fin.R,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      if (directIncomeActiveInTx && reallyFirst && invUser.referrerId && bonusForReferrer > 0) {
        const uid = invUser.referrerId;
        const arr = segmentsByUser.get(uid) ?? [];
        arr.push({
          amount: bonusForReferrer,
          type: "REFERRAL_BONUS",
          note: `Direct referral bonus · from ${beneficiaryId}`,
        });
        segmentsByUser.set(uid, arr);
      }

      for (const [uid, segs] of segmentsByUser) {
        if (segs.length > 1) {
          segs.sort((a, b) => {
            if (a.type === b.type) return 0;
            return a.type === "BINARY_PAIR" ? -1 : 1;
          });
        }
        segmentsByUser.set(uid, segs);
      }

      if (reallyFirst && invUser.referrerId && referrerSnap?.exists) {
        tx.update(usersCol.doc(invUser.referrerId), {
          qualifiedDirectReferrals: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (deductFromWallet) {
      tx.update(payerRef, {
        walletBalance: payerBalance - walletDebitTotal,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const invRef = investmentsCol.doc();
    tx.set(invRef, {
      userId: beneficiaryId,
      planId: plan.id,
      amount: plan.amount,
      dailyRoi: plan.dailyRoi,
      roiPoolPercent: roiPoolSnap,
      maxReturn: plan.maxReturn,
      maxDays: plan.maxDays,
      totalEarned: 0,
      daysCompleted: 0,
      systemActive: true,
      manualStatus: "active",
      isActive: true,
      startDate: Timestamp.now(),
      lastRoiUpdate: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (standalone) {
      tx.update(beneficiaryRef, {
        hasStandaloneInvestment: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.set(incomeCol.doc(), {
      userId: beneficiaryId,
      investmentId: invRef.id,
      amount: isGift ? 0 : -plan.amount,
      type: "INVESTMENT",
      planAmount: plan.amount,
      dayNumber: 0,
      note: standalone
        ? `Standalone plan activated - ${plan.name}`
        : isGift
          ? `Plan activated (sponsored) · ${plan.name} · funded by ${payerUser.name?.trim() || "member"}`
          : `Investment activated - ${plan.name}`,
      date: FieldValue.serverTimestamp(),
    });

    if (isGift) {
      tx.set(incomeCol.doc(), {
        userId: debitUserId,
        investmentId: invRef.id,
        amount: -plan.amount,
        type: "ADJUSTMENT",
        planAmount: 0,
        dayNumber: 0,
        note: `Wallet: sponsored plan activation for ${invUser.name?.trim() || "member"} (${beneficiaryId}) · ${plan.name}`,
        date: FieldValue.serverTimestamp(),
      });
      if (giftFeeAmount > 0) {
        tx.set(incomeCol.doc(), {
          userId: debitUserId,
          investmentId: invRef.id,
          amount: -giftFeeAmount,
          type: "ADJUSTMENT",
          planAmount: 0,
          dayNumber: 0,
          feeAmount: giftFeeAmount,
          note: `Gift plan platform fee (${giftFeePct}% on plan ₹${plan.amount})`,
          date: FieldValue.serverTimestamp(),
        });
      }
    }

    for (const [beneficiaryId, segments] of segmentsByUser) {
      if (segments.every((s) => s.amount <= 0)) continue;
      const uref = usersCol.doc(beneficiaryId);
      const uSnap = ancestorUserSnaps.find((x) => x.id === beneficiaryId)?.snap ?? referrerSnap;
      const invSnap =
        ancestorInvSnaps.get(beneficiaryId) ??
        (beneficiaryId === invUser.referrerId ? referrerInvSnap : null);
      if (!uSnap?.exists || !invSnap) continue;

      const wallet = Number((uSnap.data() as UserDoc).walletBalance ?? 0);
      const rows = buildInvWorkListWithStatus(invSnap.docs);
      const { invFinalTotals, incomeRows, totalCredited } = allocateSegmentsOnInvs(rows, segments);
      if (totalCredited <= 0) continue;

      for (const row of rows) {
        const te = invFinalTotals.get(row.id);
        if (te === undefined) continue;
        tx.update(
          row.ref,
          patchAfterEarningsCredit(te, row.maxReturn, row.manualStatus),
        );
      }

      tx.update(uref, {
        walletBalance: wallet + totalCredited,
        updatedAt: FieldValue.serverTimestamp(),
      });

      for (const row of incomeRows) {
        tx.set(incomeCol.doc(), {
          userId: beneficiaryId,
          investmentId: row.primaryInvId,
          amount: row.amount,
          type: row.type,
          planAmount: 0,
          dayNumber: 0,
          note: row.note,
          date: FieldValue.serverTimestamp(),
        });
      }
    }

    return invRef.id;
  });
}
