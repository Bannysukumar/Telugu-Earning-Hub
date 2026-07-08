import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { admin } from "./firebase-admin.js";
import { toIso, type UserDoc } from "./firestore-db.js";

const db: Firestore = admin.firestore();

export const GROWTH_SETTINGS_DOC_ID = "global";
export const GROWTH_INCOME_CYCLE_ID = "__growth_plan__";

export type GrowthPlanStatus = "none" | "active" | "expired" | "completed" | "inactive";

export type GrowthPlanUserState = {
  planStatus: GrowthPlanStatus;
  planAmount: number;
  planStartDate: Timestamp | null;
  planEndDate: Timestamp | null;
  planDuration: number;
  currentPlanIncome: number;
  lifetimeIncome: number;
  roiIncome: number;
  directIncome: number;
  withdrawableBalance: number;
  activeDirectCount: number;
  reEntryCount: number;
  earningCap: number;
  canReEnter: boolean;
  currentCycle: number;
  lastRoiProcessed: string | null;
  cycleId: string | null;
  isEligibleWithdrawal: boolean;
};

export type GrowthPlanSettingsDoc = {
  planName: string;
  planAmount: number;
  planDuration: number;
  dailyRoi: number;
  maxEarnings: number;
  directBonus: number;
  withdrawalFeePercent: number;
  minWithdrawal: number;
  planStatus: "active" | "inactive";
  enableReentry: boolean;
  enableRoi: boolean;
  enableReferralBonus: boolean;
  updatedAt: Timestamp;
};

export type GrowthCycleDoc = {
  userId: string;
  cycleNumber: number;
  planStatus: GrowthPlanStatus;
  planAmount: number;
  planStartDate: Timestamp;
  planEndDate: Timestamp;
  planDuration: number;
  currentPlanIncome: number;
  roiIncome: number;
  directIncome: number;
  earningCap: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp | null;
};

export const GROWTH_PLAN_DEFAULTS: Omit<GrowthPlanSettingsDoc, "updatedAt"> = {
  planName: "Smart Growth Plan ₹200",
  planAmount: 200,
  planDuration: 12,
  dailyRoi: 20,
  maxEarnings: 400,
  directBonus: 20,
  withdrawalFeePercent: 10,
  minWithdrawal: 200,
  planStatus: "active",
  enableReentry: true,
  enableRoi: true,
  enableReferralBonus: true,
};

export type GrowthUserDoc = UserDoc & {
  referredBy?: string | null;
  directBonusPaid?: boolean;
  growthPlan?: GrowthPlanUserState;
};

export function emptyGrowthPlanState(settings: GrowthPlanSettingsDoc): GrowthPlanUserState {
  return {
    planStatus: "none",
    planAmount: settings.planAmount,
    planStartDate: null,
    planEndDate: null,
    planDuration: settings.planDuration,
    currentPlanIncome: 0,
    lifetimeIncome: 0,
    roiIncome: 0,
    directIncome: 0,
    withdrawableBalance: 0,
    activeDirectCount: 0,
    reEntryCount: 0,
    earningCap: settings.maxEarnings,
    canReEnter: false,
    currentCycle: 0,
    lastRoiProcessed: null,
    cycleId: null,
    isEligibleWithdrawal: false,
  };
}

export function normalizeGrowthPlanState(
  raw: Partial<GrowthPlanUserState> | undefined,
  settings: GrowthPlanSettingsDoc,
): GrowthPlanUserState {
  const base = emptyGrowthPlanState(settings);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    planStatus: (raw.planStatus as GrowthPlanStatus) ?? base.planStatus,
    earningCap: Number(raw.earningCap ?? settings.maxEarnings),
    planAmount: Number(raw.planAmount ?? settings.planAmount),
    planDuration: Number(raw.planDuration ?? settings.planDuration),
  };
}

export function istDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysIst(start: Date, days: number): Date {
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

export async function getGrowthPlanSettings(): Promise<GrowthPlanSettingsDoc & { id: string }> {
  const snap = await db.collection("growthPlanSettings").doc(GROWTH_SETTINGS_DOC_ID).get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await db.collection("growthPlanSettings").doc(GROWTH_SETTINGS_DOC_ID).set({
      ...GROWTH_PLAN_DEFAULTS,
      updatedAt: now,
    });
    const created = await db.collection("growthPlanSettings").doc(GROWTH_SETTINGS_DOC_ID).get();
    return { id: GROWTH_SETTINGS_DOC_ID, ...(created.data() as GrowthPlanSettingsDoc) };
  }
  return { id: snap.id, ...(snap.data() as GrowthPlanSettingsDoc) };
}

export async function updateGrowthPlanSettings(
  patch: Partial<Omit<GrowthPlanSettingsDoc, "updatedAt">>,
): Promise<GrowthPlanSettingsDoc & { id: string }> {
  await db
    .collection("growthPlanSettings")
    .doc(GROWTH_SETTINGS_DOC_ID)
    .set(
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return getGrowthPlanSettings();
}

export async function getGrowthUser(uid: string): Promise<(GrowthUserDoc & { id: string }) | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as GrowthUserDoc) };
}

export async function countActiveGrowthDirects(sponsorId: string): Promise<number> {
  const snap = await db.collection("users").where("referredBy", "==", sponsorId).get();
  let count = 0;
  for (const doc of snap.docs) {
    const gp = (doc.data() as GrowthUserDoc).growthPlan;
    if (gp?.planStatus === "active") count += 1;
  }
  return count;
}

export type GrowthWithdrawalCheck = {
  appliesGrowthRules: boolean;
  eligible: boolean;
  reason: string | null;
  minWithdrawal: number;
};

export async function evaluateGrowthWithdrawalEligibility(
  user: GrowthUserDoc & { id: string },
  requestAmount: number,
): Promise<GrowthWithdrawalCheck> {
  const settings = await getGrowthPlanSettings();
  const gp = user.growthPlan;
  const participates =
    Boolean(gp && gp.planStatus !== "none") || Number(gp?.reEntryCount ?? 0) > 0 || Number(gp?.currentCycle ?? 0) > 0;

  if (!participates) {
    return {
      appliesGrowthRules: false,
      eligible: true,
      reason: null,
      minWithdrawal: 500,
    };
  }

  if (!gp || gp.planStatus !== "active") {
    const reason =
      gp?.planStatus === "expired"
        ? "Plan expired"
        : gp?.planStatus === "completed"
          ? "Plan completed"
          : gp?.planStatus === "inactive"
            ? "Activate your plan"
            : "Activate your plan";
    return {
      appliesGrowthRules: true,
      eligible: false,
      reason,
      minWithdrawal: settings.minWithdrawal,
    };
  }

  const activeDirects = await countActiveGrowthDirects(user.id);
  if (activeDirects < 2) {
    return {
      appliesGrowthRules: true,
      eligible: false,
      reason: "Need 2 Active Direct Referrals",
      minWithdrawal: settings.minWithdrawal,
    };
  }

  if (requestAmount < settings.minWithdrawal) {
    return {
      appliesGrowthRules: true,
      eligible: false,
      reason: "Minimum withdrawal not reached",
      minWithdrawal: settings.minWithdrawal,
    };
  }

  if (user.walletBalance < requestAmount) {
    return {
      appliesGrowthRules: true,
      eligible: false,
      reason: "Insufficient wallet balance",
      minWithdrawal: settings.minWithdrawal,
    };
  }

  return {
    appliesGrowthRules: true,
    eligible: true,
    reason: null,
    minWithdrawal: settings.minWithdrawal,
  };
}

async function refreshSponsorDirectCount(tx: Transaction, sponsorId: string): Promise<void> {
  const sponsorRef = db.collection("users").doc(sponsorId);
  const sponsorSnap = await tx.get(sponsorRef);
  if (!sponsorSnap.exists) return;
  const sponsor = sponsorSnap.data() as GrowthUserDoc;
  const directsQuery = db.collection("users").where("referredBy", "==", sponsorId);
  const directsSnap = await tx.get(directsQuery);
  let activeDirectCount = 0;
  for (const doc of directsSnap.docs) {
    const gp = (doc.data() as GrowthUserDoc).growthPlan;
    if (gp?.planStatus === "active") activeDirectCount += 1;
  }
  const gp = normalizeGrowthPlanState(sponsor.growthPlan, GROWTH_PLAN_DEFAULTS as GrowthPlanSettingsDoc);
  const isEligibleWithdrawal = gp.planStatus === "active" && activeDirectCount >= 2;
  tx.update(sponsorRef, {
    growthPlan: {
      ...gp,
      activeDirectCount,
      isEligibleWithdrawal,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function creditGrowthIncome(
  state: GrowthPlanUserState,
  amount: number,
  kind: "roi" | "direct",
): GrowthPlanUserState {
  const room = Math.max(0, state.earningCap - state.currentPlanIncome);
  const payout = Math.min(amount, room);
  if (payout <= 0) return state;
  const next: GrowthPlanUserState = {
    ...state,
    currentPlanIncome: state.currentPlanIncome + payout,
    lifetimeIncome: state.lifetimeIncome + payout,
    withdrawableBalance: state.withdrawableBalance + payout,
    roiIncome: kind === "roi" ? state.roiIncome + payout : state.roiIncome,
    directIncome: kind === "direct" ? state.directIncome + payout : state.directIncome,
  };
  if (next.currentPlanIncome >= next.earningCap) {
    next.planStatus = "completed";
    next.canReEnter = true;
    next.isEligibleWithdrawal = false;
  }
  return next;
}

export class GrowthPlanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "GrowthPlanError";
  }
}

export type ActivateGrowthPlanOptions = {
  /** When false (admin gift), wallet is not deducted. Default true. */
  deductFromWallet?: boolean;
};

export async function activateGrowthPlan(
  userId: string,
  options: ActivateGrowthPlanOptions = {},
): Promise<{ cycleId: string; cycleNumber: number }> {
  const deductFromWallet = options.deductFromWallet !== false;
  const settings = await getGrowthPlanSettings();
  if (settings.planStatus !== "active") {
    throw new GrowthPlanError("Smart Growth Plan is not active", "PLAN_INACTIVE");
  }

  return db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new GrowthPlanError("User not found", "USER_NOT_FOUND");
    const user = userSnap.data() as GrowthUserDoc;
    if (!user.isActive) throw new GrowthPlanError("Account deactivated", "USER_INACTIVE");

    const gp = normalizeGrowthPlanState(user.growthPlan, settings);
    if (gp.planStatus === "active") {
      throw new GrowthPlanError("You already have an active Smart Growth Plan", "ALREADY_ACTIVE");
    }
    const canEnter =
      gp.planStatus === "none" ||
      gp.planStatus === "expired" ||
      gp.planStatus === "completed" ||
      gp.canReEnter;
    if (!canEnter) {
      throw new GrowthPlanError("Re-entry is not allowed right now", "REENTRY_BLOCKED");
    }
    if (!settings.enableReentry && gp.planStatus !== "none" && gp.currentCycle > 0) {
      throw new GrowthPlanError("Re-entry is disabled by admin", "REENTRY_DISABLED");
    }

    const balance = Number(user.walletBalance ?? 0);
    if (deductFromWallet && balance < settings.planAmount) {
      throw new GrowthPlanError("Insufficient wallet balance", "INSUFFICIENT_BALANCE");
    }

    const now = Timestamp.now();
    const startDate = now.toDate();
    const endDate = addDaysIst(startDate, settings.planDuration);
    const cycleNumber = gp.currentCycle + 1;
    const cycleRef = db.collection("growthCycles").doc();
    const nextState: GrowthPlanUserState = {
      planStatus: "active",
      planAmount: settings.planAmount,
      planStartDate: now,
      planEndDate: Timestamp.fromDate(endDate),
      planDuration: settings.planDuration,
      currentPlanIncome: 0,
      lifetimeIncome: gp.lifetimeIncome,
      roiIncome: 0,
      directIncome: 0,
      withdrawableBalance: 0,
      activeDirectCount: gp.activeDirectCount,
      reEntryCount: gp.planStatus === "none" ? gp.reEntryCount : gp.reEntryCount + 1,
      earningCap: settings.maxEarnings,
      canReEnter: false,
      currentCycle: cycleNumber,
      lastRoiProcessed: null,
      cycleId: cycleRef.id,
      isEligibleWithdrawal: false,
    };

    tx.set(cycleRef, {
      userId,
      cycleNumber,
      planStatus: "active",
      planAmount: settings.planAmount,
      planStartDate: now,
      planEndDate: Timestamp.fromDate(endDate),
      planDuration: settings.planDuration,
      currentPlanIncome: 0,
      roiIncome: 0,
      directIncome: 0,
      earningCap: settings.maxEarnings,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    } satisfies GrowthCycleDoc);

    tx.update(userRef, {
      ...(deductFromWallet ? { walletBalance: balance - settings.planAmount } : {}),
      growthPlan: nextState,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const incomeRef = db.collection("incomeHistory").doc();
    tx.set(incomeRef, {
      userId,
      investmentId: GROWTH_INCOME_CYCLE_ID,
      amount: deductFromWallet ? -settings.planAmount : 0,
      type: "INVESTMENT",
      planAmount: settings.planAmount,
      dayNumber: 0,
      note: deductFromWallet
        ? `${settings.planName} activation · Cycle ${cycleNumber}`
        : `${settings.planName} admin activation · Cycle ${cycleNumber}`,
      date: now,
    });

    if (user.referredBy && settings.enableReferralBonus && !user.directBonusPaid) {
      const sponsorRef = db.collection("users").doc(user.referredBy);
      const sponsorSnap = await tx.get(sponsorRef);
      if (sponsorSnap.exists) {
        const sponsor = sponsorSnap.data() as GrowthUserDoc;
        const sponsorGp = normalizeGrowthPlanState(sponsor.growthPlan, settings);
        let sponsorWallet = Number(sponsor.walletBalance ?? 0);
        let updatedSponsorGp = sponsorGp;
        let historyAmount = 0;
        if (sponsorGp.planStatus === "active") {
          updatedSponsorGp = creditGrowthIncome(sponsorGp, settings.directBonus, "direct");
          const credited = updatedSponsorGp.directIncome - sponsorGp.directIncome;
          sponsorWallet += credited;
          historyAmount = credited;
        } else {
          historyAmount = settings.directBonus;
          sponsorWallet += settings.directBonus;
          updatedSponsorGp = {
            ...sponsorGp,
            lifetimeIncome: sponsorGp.lifetimeIncome + settings.directBonus,
            directIncome: sponsorGp.directIncome + settings.directBonus,
            withdrawableBalance: sponsorGp.withdrawableBalance + settings.directBonus,
          };
        }
        tx.update(sponsorRef, {
          walletBalance: sponsorWallet,
          growthPlan: updatedSponsorGp,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (historyAmount > 0) {
          const bonusRef = db.collection("incomeHistory").doc();
          tx.set(bonusRef, {
            userId: user.referredBy,
            investmentId: GROWTH_INCOME_CYCLE_ID,
            amount: historyAmount,
            type: "GROWTH_DIRECT",
            planAmount: settings.planAmount,
            dayNumber: 0,
            note: `Direct referral bonus from ${user.name || user.email}`,
            date: now,
          });
        }
      }
      tx.update(userRef, { directBonusPaid: true });
      if (user.referredBy) await refreshSponsorDirectCount(tx, user.referredBy);
    }

    return { cycleId: cycleRef.id, cycleNumber };
  });
}

export async function listGrowthCycles(userId: string): Promise<(GrowthCycleDoc & { id: string })[]> {
  const snap = await db.collection("growthCycles").where("userId", "==", userId).get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as GrowthCycleDoc) }));
  return rows.sort((a, b) => b.cycleNumber - a.cycleNumber);
}

export async function listGrowthDirects(
  sponsorId: string,
): Promise<Array<{ id: string; name: string; email: string; planStatus: GrowthPlanStatus }>> {
  const snap = await db.collection("users").where("referredBy", "==", sponsorId).get();
  return snap.docs.map((doc) => {
    const u = doc.data() as GrowthUserDoc;
    return {
      id: doc.id,
      name: u.name,
      email: u.email,
      planStatus: (u.growthPlan?.planStatus ?? "none") as GrowthPlanStatus,
    };
  });
}

export function formatGrowthDashboard(
  user: GrowthUserDoc & { id: string },
  settings: GrowthPlanSettingsDoc & { id: string },
  directs: Awaited<ReturnType<typeof listGrowthDirects>>,
) {
  const gp = normalizeGrowthPlanState(user.growthPlan, settings);
  const now = new Date();
  const end = gp.planEndDate ? gp.planEndDate.toDate() : null;
  const remainingDays =
    gp.planStatus === "active" && end
      ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
  const progressPct =
    gp.earningCap > 0 ? Math.min(100, Math.round((gp.currentPlanIncome / gp.earningCap) * 100)) : 0;
  const activeDirects = directs.filter((d) => d.planStatus === "active").length;

  return {
    settings: {
      planName: settings.planName,
      planAmount: settings.planAmount,
      planDuration: settings.planDuration,
      dailyRoi: settings.dailyRoi,
      maxEarnings: settings.maxEarnings,
      directBonus: settings.directBonus,
      minWithdrawal: settings.minWithdrawal,
      enableReentry: settings.enableReentry,
    },
    planStatus: gp.planStatus,
    planAmount: gp.planAmount,
    planStartDate: gp.planStartDate ? toIso(gp.planStartDate) : null,
    planEndDate: gp.planEndDate ? toIso(gp.planEndDate) : null,
    remainingDays,
    todaysRoi: settings.dailyRoi,
    currentPlanIncome: gp.currentPlanIncome,
    maxEarnings: gp.earningCap,
    progressPct,
    lifetimeIncome: gp.lifetimeIncome,
    roiIncome: gp.roiIncome,
    directIncome: gp.directIncome,
    withdrawableBalance: user.walletBalance,
    walletBalance: user.walletBalance,
    totalDirects: directs.length,
    activeDirects,
    isEligibleWithdrawal: gp.isEligibleWithdrawal && activeDirects >= 2 && gp.planStatus === "active",
    canReEnter: gp.canReEnter || gp.planStatus === "expired" || gp.planStatus === "completed",
    reEntryCount: gp.reEntryCount,
    currentCycle: gp.currentCycle,
    referralCode: user.id,
    referralLink: `/register?ref=${user.id}`,
    directs,
  };
}

export async function migrateUserGrowthFields(userId: string): Promise<void> {
  const settings = await getGrowthPlanSettings();
  const user = await getGrowthUser(userId);
  if (!user) return;
  if (user.growthPlan) return;
  await db.collection("users").doc(userId).update({
    growthPlan: emptyGrowthPlanState(settings),
    directBonusPaid: user.directBonusPaid ?? false,
    referredBy: user.referredBy ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function migrateAllUsersGrowthFields(): Promise<number> {
  const settings = await getGrowthPlanSettings();
  const snap = await db.collection("users").get();
  let updated = 0;
  const batchSize = 400;
  let batch = db.batch();
  let ops = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as GrowthUserDoc;
    if (data.growthPlan) continue;
    batch.update(doc.ref, {
      growthPlan: emptyGrowthPlanState(settings),
      directBonusPaid: data.directBonusPaid ?? false,
      referredBy: data.referredBy ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    updated += 1;
    ops += 1;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return updated;
}

export function growthPlanStateFromData(
  data: DocumentData | undefined,
  settings: GrowthPlanSettingsDoc,
): GrowthPlanUserState {
  return normalizeGrowthPlanState(data?.growthPlan as Partial<GrowthPlanUserState> | undefined, settings);
}
