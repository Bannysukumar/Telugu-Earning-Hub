import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { admin } from "./firebase-admin.js";

const db: Firestore = getFirestore(admin.app());

export type UserDoc = {
  name: string;
  email: string;
  phone: string;
  role: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Throttles back-to-back withdrawal requests (server timestamp). */
  lastWithdrawalRequestAt?: Timestamp;
};

export type PlanDoc = {
  name: string;
  amount: number;
  dailyRoi: number;
  maxReturn: number;
  maxDays: number;
  description: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ManualStatus = "active" | "inactive";

export type InvestmentDoc = {
  userId: string;
  planId: string;
  amount: number;
  dailyRoi: number;
  maxReturn: number;
  totalEarned: number;
  daysCompleted: number;
  maxDays: number;
  /** System-derived: false after 2× return or max days */
  systemActive: boolean;
  /** Admin override */
  manualStatus: ManualStatus;
  /** Denormalized: systemActive && manualStatus === "active" (for queries) */
  isActive: boolean;
  startDate: Timestamp;
  lastRoiUpdate: Timestamp | null;
  createdAt: Timestamp;
};

export type WithdrawalDoc = {
  userId: string;
  /** Gross amount deducted from wallet */
  requestAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  status: string;
  bankDetails: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

export type SettingsDoc = {
  withdrawalFeePercent: number;
  updatedAt: Timestamp;
};

const SETTINGS_GLOBAL_ID = "global";

export type PaymentSettingsDoc = {
  qrCodeImageUrl: string;
  isPaymentEnabled: boolean;
  updatedAt: Timestamp;
};

export type DepositDoc = {
  userId: string;
  amount: number;
  transactionId: string;
  screenshotUrl: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

const PAYMENT_SETTINGS_GLOBAL_ID = "global";

const PAYMENT_SETTINGS_DEFAULT: Omit<PaymentSettingsDoc, "updatedAt"> = {
  qrCodeImageUrl: "",
  isPaymentEnabled: false,
};

export function normalizeDepositTransactionId(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export async function getPaymentSettings(): Promise<{
  id: string;
  qrCodeImageUrl: string;
  isPaymentEnabled: boolean;
  updatedAt: string | null;
}> {
  const snap = await db.collection("paymentSettings").doc(PAYMENT_SETTINGS_GLOBAL_ID).get();
  if (!snap.exists) {
    return {
      id: PAYMENT_SETTINGS_GLOBAL_ID,
      ...PAYMENT_SETTINGS_DEFAULT,
      updatedAt: null,
    };
  }
  const d = snap.data() as Partial<PaymentSettingsDoc>;
  const qrCodeImageUrl = typeof d.qrCodeImageUrl === "string" ? d.qrCodeImageUrl : "";
  const isPaymentEnabled = Boolean(d.isPaymentEnabled);
  const updatedAt = d.updatedAt as Timestamp | undefined;
  return {
    id: snap.id,
    qrCodeImageUrl,
    isPaymentEnabled,
    updatedAt: updatedAt ? toIso(updatedAt) : null,
  };
}

export async function updatePaymentSettings(patch: Partial<Pick<PaymentSettingsDoc, "qrCodeImageUrl" | "isPaymentEnabled">>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await db.collection("paymentSettings").doc(PAYMENT_SETTINGS_GLOBAL_ID).set(
    {
      ...Object.fromEntries(entries),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function mapDepositDoc(id: string, data: DocumentData): DepositDoc & { id: string } {
  return {
    id,
    userId: String(data.userId ?? ""),
    amount: Number(data.amount ?? 0),
    transactionId: String(data.transactionId ?? ""),
    screenshotUrl: String(data.screenshotUrl ?? ""),
    note: data.note != null ? String(data.note) : null,
    status: data.status === "approved" || data.status === "rejected" ? data.status : "pending",
    createdAt: data.createdAt as Timestamp,
    updatedAt: (data.updatedAt as Timestamp | null | undefined) ?? null,
  };
}

export async function listDepositsByUser(userId: string): Promise<(DepositDoc & { id: string })[]> {
  const snap = await db.collection("deposits").where("userId", "==", userId).get();
  const rows = snap.docs.map((doc) => mapDepositDoc(doc.id, doc.data()!));
  return rows.sort((a, b) => toIso(b.createdAt).localeCompare(toIso(a.createdAt)));
}

export async function listAllDepositsOrdered(): Promise<(DepositDoc & { id: string })[]> {
  const snap = await db.collection("deposits").get();
  const rows = snap.docs.map((doc) => mapDepositDoc(doc.id, doc.data()!));
  return rows.sort((a, b) => toIso(b.createdAt).localeCompare(toIso(a.createdAt)));
}

export async function getDeposit(id: string): Promise<(DepositDoc & { id: string }) | null> {
  const snap = await db.collection("deposits").doc(id).get();
  if (!snap.exists) return null;
  return mapDepositDoc(snap.id, snap.data()!);
}

export type DepositRequestErrorCode =
  | "PAYMENTS_DISABLED"
  | "PENDING_DEPOSIT_EXISTS"
  | "DUPLICATE_TRANSACTION_ID"
  | "USER_NOT_FOUND";

export class DepositRequestError extends Error {
  constructor(
    message: string,
    public readonly code: DepositRequestErrorCode,
  ) {
    super(message);
    this.name = "DepositRequestError";
  }
}

/** Create deposit atomically: no pending row, payments on, unique transaction id (any status). */
export async function createDepositAtomic(params: {
  userId: string;
  amount: number;
  transactionId: string;
  screenshotUrl: string;
  note: string | null;
}): Promise<string> {
  const { userId, amount, transactionId, screenshotUrl, note } = params;
  const settingsRef = db.collection("paymentSettings").doc(PAYMENT_SETTINGS_GLOBAL_ID);
  const depositsCol = db.collection("deposits");
  const usersRef = db.collection("users").doc(userId);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(usersRef);
    if (!userSnap.exists) {
      throw new DepositRequestError("User not found", "USER_NOT_FOUND");
    }

    const settingsSnap = await tx.get(settingsRef);
    let enabled = false;
    if (settingsSnap.exists) {
      enabled = Boolean((settingsSnap.data() as Partial<PaymentSettingsDoc>).isPaymentEnabled);
    }
    if (!enabled) {
      throw new DepositRequestError("QR deposits are currently disabled.", "PAYMENTS_DISABLED");
    }

    const pendingQ = depositsCol.where("userId", "==", userId).where("status", "==", "pending");
    const pendingSnap = await tx.get(pendingQ);
    if (!pendingSnap.empty) {
      throw new DepositRequestError(
        "Your previous request is pending. Please wait for admin approval.",
        "PENDING_DEPOSIT_EXISTS",
      );
    }

    const tidQ = depositsCol.where("transactionId", "==", transactionId);
    const tidSnap = await tx.get(tidQ);
    if (!tidSnap.empty) {
      throw new DepositRequestError(
        "This transaction ID has already been used. Please check and try again.",
        "DUPLICATE_TRANSACTION_ID",
      );
    }

    const ref = depositsCol.doc();
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      userId,
      amount,
      transactionId,
      screenshotUrl,
      note,
      status: "pending",
      createdAt: now,
      updatedAt: null,
    });

    return ref.id;
  });
}

export class DepositAdminError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "INVALID_STATUS" | "ALREADY_RESOLVED",
  ) {
    super(message);
    this.name = "DepositAdminError";
  }
}

/** Approve or reject. On approve, credits wallet once. Idempotent if already same status. */
export async function resolveDepositAdmin(depositId: string, status: "approved" | "rejected"): Promise<void> {
  const depRef = db.collection("deposits").doc(depositId);
  const incomeCol = db.collection("incomeHistory");

  await db.runTransaction(async (tx) => {
    const depSnap = await tx.get(depRef);
    if (!depSnap.exists) {
      throw new DepositAdminError("Deposit not found", "NOT_FOUND");
    }
    const dep = mapDepositDoc(depSnap.id, depSnap.data()!);

    if (dep.status === status) {
      return;
    }

    if (dep.status !== "pending") {
      throw new DepositAdminError("This deposit has already been processed.", "ALREADY_RESOLVED");
    }

    const now = FieldValue.serverTimestamp();

    if (status === "rejected") {
      tx.update(depRef, { status: "rejected", updatedAt: now });
      return;
    }

    const userRef = db.collection("users").doc(dep.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new DepositAdminError("User not found", "NOT_FOUND");
    }
    const user = userSnap.data() as UserDoc;
    const balance = Number(user.walletBalance ?? 0);

    tx.update(userRef, {
      walletBalance: balance + dep.amount,
      updatedAt: now,
    });

    tx.update(depRef, { status: "approved", updatedAt: now });

    const incRef = incomeCol.doc();
    tx.set(incRef, {
      userId: dep.userId,
      investmentId: "__deposit__",
      amount: dep.amount,
      type: "ADJUSTMENT",
      planAmount: 0,
      dayNumber: 0,
      note: `Wallet deposit · Txn ${dep.transactionId}`,
      date: now,
    });
  });
}

export async function getWithdrawalFeePercent(): Promise<number> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  if (!snap.exists) return 10;
  const raw = (snap.data() as Partial<SettingsDoc>).withdrawalFeePercent;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 100) return 10;
  return v;
}

export async function setWithdrawalFeePercent(percent: number): Promise<void> {
  await db.collection("settings").doc(SETTINGS_GLOBAL_ID).set(
    {
      withdrawalFeePercent: percent,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Legacy `amount`-only withdrawal rows map to requestAmount; fee fields default to 0 / net = gross. */
export function normalizeWithdrawalDoc(id: string, data: DocumentData): WithdrawalDoc & { id: string } {
  const legacyAmount = Number(data.amount);
  const requestAmount =
    typeof data.requestAmount === "number" && Number.isFinite(data.requestAmount)
      ? data.requestAmount
      : Number.isFinite(legacyAmount)
        ? legacyAmount
        : 0;
  const feePercent =
    typeof data.feePercent === "number" && Number.isFinite(data.feePercent) ? data.feePercent : 0;
  const feeAmount =
    typeof data.feeAmount === "number" && Number.isFinite(data.feeAmount) ? data.feeAmount : 0;
  const netAmount =
    typeof data.netAmount === "number" && Number.isFinite(data.netAmount)
      ? data.netAmount
      : Math.max(0, requestAmount - feeAmount);
  return {
    id,
    userId: String(data.userId ?? ""),
    requestAmount,
    feePercent,
    feeAmount,
    netAmount,
    status: String(data.status ?? "pending"),
    bankDetails: data.bankDetails != null ? String(data.bankDetails) : null,
    createdAt: data.createdAt as Timestamp,
    updatedAt: (data.updatedAt as Timestamp | null | undefined) ?? null,
  };
}

export type IncomeHistoryDoc = {
  userId: string;
  investmentId: string;
  amount: number;
  type: "ROI" | "ADJUSTMENT" | "WITHDRAWAL" | "INVESTMENT";
  date: Timestamp;
  planAmount: number;
  dayNumber: number;
  note?: string | null;
  feeAmount?: number | null;
  netAmount?: number | null;
};

export function computeInvestmentIsActive(systemActive: boolean, manualStatus: ManualStatus): boolean {
  return systemActive && manualStatus === "active";
}

/** Normalize Firestore payload (supports legacy docs without systemActive / manualStatus). */
export function normalizeInvestmentFields(id: string, data: DocumentData): InvestmentDoc & { id: string } {
  const legacyIsActive = Boolean(data.isActive);
  let systemActive: boolean;
  let manualStatus: ManualStatus;

  if (typeof data.systemActive === "boolean" || data.manualStatus === "active" || data.manualStatus === "inactive") {
    systemActive = typeof data.systemActive === "boolean" ? data.systemActive : legacyIsActive;
    manualStatus = data.manualStatus === "inactive" ? "inactive" : "active";
  } else {
    systemActive = legacyIsActive;
    manualStatus = legacyIsActive ? "active" : "inactive";
  }

  const isActive = computeInvestmentIsActive(systemActive, manualStatus);

  return {
    id,
    userId: String(data.userId),
    planId: String(data.planId),
    amount: Number(data.amount),
    dailyRoi: Number(data.dailyRoi),
    maxReturn: Number(data.maxReturn),
    totalEarned: Number(data.totalEarned ?? 0),
    daysCompleted: Number(data.daysCompleted ?? 0),
    maxDays: Number(data.maxDays),
    systemActive,
    manualStatus,
    isActive,
    startDate: data.startDate as Timestamp,
    lastRoiUpdate: (data.lastRoiUpdate as Timestamp | null | undefined) ?? null,
    createdAt: data.createdAt as Timestamp,
  };
}

export function toIso(t: Timestamp | Date | null | undefined): string {
  if (!t) return new Date().toISOString();
  if (t instanceof Date) return t.toISOString();
  return (t as Timestamp).toDate().toISOString();
}

export async function getUser(uid: string): Promise<(UserDoc & { id: string }) | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() as UserDoc;
  return { id: snap.id, ...d };
}

export async function createUserProfile(
  uid: string,
  data: {
    name: string;
    email: string;
    phone: string;
    role: string;
    walletBalance: number;
    isActive: boolean;
  },
): Promise<void> {
  const now = FieldValue.serverTimestamp();
  await db.collection("users").doc(uid).set({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateUser(uid: string, patch: Partial<UserDoc>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await db.collection("users").doc(uid).update({
    ...Object.fromEntries(entries),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listUsersOrdered(): Promise<(UserDoc & { id: string })[]> {
  const snap = await db.collection("users").get();
  const rows = snap.docs.map((doc) => {
    const d = doc.data() as UserDoc & { phone?: string };
    return { id: doc.id, ...d, phone: d.phone ?? "" };
  });
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

export async function getPlan(planId: string): Promise<(PlanDoc & { id: string }) | null> {
  const snap = await db.collection("plans").doc(planId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as PlanDoc) };
}

export async function listActivePlans(): Promise<(PlanDoc & { id: string })[]> {
  try {
    const snap = await db.collection("plans").where("isActive", "==", true).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as PlanDoc) }));
  } catch {
    const snap = await db.collection("plans").get();
    return snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as PlanDoc) }))
      .filter((p) => p.isActive !== false);
  }
}

export async function listAllPlansOrdered(): Promise<(PlanDoc & { id: string })[]> {
  const snap = await db.collection("plans").get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as PlanDoc) }));
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

export async function createPlan(data: Omit<PlanDoc, "createdAt" | "updatedAt">): Promise<string> {
  const ref = db.collection("plans").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updatePlan(planId: string, patch: Partial<PlanDoc>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await db.collection("plans").doc(planId).update({
    ...Object.fromEntries(entries),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deletePlan(planId: string): Promise<void> {
  await db.collection("plans").doc(planId).delete();
}

function mapInvestmentDoc(doc: { id: string; data: () => DocumentData | undefined }): InvestmentDoc & { id: string } {
  const data = doc.data();
  if (!data) throw new Error("Investment document missing data");
  return normalizeInvestmentFields(doc.id, data);
}

export async function listInvestmentsByUser(userId: string): Promise<(InvestmentDoc & { id: string })[]> {
  const snap = await db.collection("investments").where("userId", "==", userId).get();
  const rows = snap.docs.map((doc) => mapInvestmentDoc(doc));
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

export async function listAllInvestmentsOrdered(): Promise<(InvestmentDoc & { id: string })[]> {
  const snap = await db.collection("investments").get();
  const rows = snap.docs.map((doc) => mapInvestmentDoc(doc));
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

export async function getInvestment(id: string): Promise<(InvestmentDoc & { id: string }) | null> {
  const snap = await db.collection("investments").doc(id).get();
  if (!snap.exists) return null;
  return mapInvestmentDoc(snap);
}

export async function createInvestment(data: Omit<InvestmentDoc, "createdAt">): Promise<string> {
  const ref = db.collection("investments").doc();
  await ref.set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateInvestment(invId: string, patch: Partial<InvestmentDoc>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await db.collection("investments").doc(invId).update(Object.fromEntries(entries));
}

export async function listActiveInvestments(): Promise<(InvestmentDoc & { id: string })[]> {
  const snap = await db.collection("investments").where("isActive", "==", true).get();
  return snap.docs.map((doc) => mapInvestmentDoc(doc));
}

export async function listWithdrawalsByUser(userId: string): Promise<(WithdrawalDoc & { id: string })[]> {
  const snap = await db.collection("withdrawals").where("userId", "==", userId).get();
  const rows = snap.docs.map((doc) => normalizeWithdrawalDoc(doc.id, doc.data()!));
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

export async function listAllWithdrawalsOrdered(): Promise<(WithdrawalDoc & { id: string })[]> {
  const snap = await db.collection("withdrawals").get();
  const rows = snap.docs.map((doc) => normalizeWithdrawalDoc(doc.id, doc.data()!));
  return rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
}

const WITHDRAWAL_INCOME_INVESTMENT_ID = "__withdrawal__";

export type WithdrawalRequestErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "PENDING_WITHDRAWAL_EXISTS"
  | "WITHDRAWAL_COOLDOWN"
  | "USER_NOT_FOUND";

export class WithdrawalRequestError extends Error {
  constructor(
    message: string,
    public readonly code: WithdrawalRequestErrorCode,
  ) {
    super(message);
    this.name = "WithdrawalRequestError";
  }
}

/** Atomic: fee from settings at commit time, deduct gross from wallet, block duplicate pending + short cooldown. */
export async function createWithdrawalRequestAtomic(params: {
  userId: string;
  requestAmount: number;
  bankDetails: string | null;
}): Promise<string> {
  const { userId, requestAmount, bankDetails } = params;
  const usersRef = db.collection("users").doc(userId);
  const settingsRef = db.collection("settings").doc(SETTINGS_GLOBAL_ID);
  const withdrawalsCol = db.collection("withdrawals");
  const incomeCol = db.collection("incomeHistory");

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(usersRef);
    if (!userSnap.exists) {
      throw new WithdrawalRequestError("User not found", "USER_NOT_FOUND");
    }

    const user = userSnap.data() as UserDoc & { lastWithdrawalRequestAt?: Timestamp };
    const balance = Number(user.walletBalance ?? 0);
    if (requestAmount > balance) {
      throw new WithdrawalRequestError("Insufficient wallet balance", "INSUFFICIENT_BALANCE");
    }

    const settingsSnap = await tx.get(settingsRef);
    let feePct = 10;
    if (settingsSnap.exists) {
      const v = Number((settingsSnap.data() as Partial<SettingsDoc>).withdrawalFeePercent);
      if (Number.isFinite(v) && v >= 0 && v <= 100) feePct = v;
    }
    const feeAmount = Math.round((requestAmount * feePct) / 100);
    const netAmount = requestAmount - feeAmount;

    const pendingQ = withdrawalsCol.where("userId", "==", userId).where("status", "==", "pending");
    const pendingSnap = await tx.get(pendingQ);
    if (!pendingSnap.empty) {
      throw new WithdrawalRequestError(
        "You already have a pending withdrawal. Please wait for it to be processed.",
        "PENDING_WITHDRAWAL_EXISTS",
      );
    }

    const last = user.lastWithdrawalRequestAt;
    if (last) {
      const ms = last instanceof Timestamp ? last.toMillis() : 0;
      if (ms > 0 && Date.now() - ms < 45_000) {
        throw new WithdrawalRequestError("Please wait a moment before requesting another withdrawal.", "WITHDRAWAL_COOLDOWN");
      }
    }

    const wRef = withdrawalsCol.doc();
    const now = FieldValue.serverTimestamp();

    tx.set(wRef, {
      userId,
      requestAmount,
      feePercent: feePct,
      feeAmount,
      netAmount,
      status: "pending",
      bankDetails,
      createdAt: now,
      updatedAt: null,
    });

    tx.update(usersRef, {
      walletBalance: balance - requestAmount,
      lastWithdrawalRequestAt: now,
      updatedAt: now,
    });

    const incRef = incomeCol.doc();
    tx.set(incRef, {
      userId,
      investmentId: WITHDRAWAL_INCOME_INVESTMENT_ID,
      amount: -requestAmount,
      type: "WITHDRAWAL",
      planAmount: 0,
      dayNumber: 0,
      note: `Withdrawal request · Fee ${feeAmount} · Net ${netAmount}`,
      feeAmount,
      netAmount,
      date: now,
    });

    return wRef.id;
  });
}

export async function getWithdrawal(id: string): Promise<(WithdrawalDoc & { id: string }) | null> {
  const snap = await db.collection("withdrawals").doc(id).get();
  if (!snap.exists) return null;
  return normalizeWithdrawalDoc(snap.id, snap.data()!);
}

export async function updateWithdrawal(id: string, patch: Partial<WithdrawalDoc>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await db.collection("withdrawals").doc(id).update({
    ...Object.fromEntries(entries),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function addIncomeHistory(
  entry: Omit<IncomeHistoryDoc, "date"> & { date?: Timestamp },
): Promise<string> {
  const ref = db.collection("incomeHistory").doc();
  await ref.set({
    userId: entry.userId,
    investmentId: entry.investmentId,
    amount: entry.amount,
    type: entry.type,
    planAmount: entry.planAmount,
    dayNumber: entry.dayNumber,
    note: entry.note ?? null,
    date: entry.date ?? FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export type IncomeHistoryListResult = {
  items: (IncomeHistoryDoc & { id: string })[];
  nextCursor: string | null;
};

/** Firestore composite index missing / gRPC FAILED_PRECONDITION (shape varies by SDK). */
function isFirestoreIndexError(err: unknown): boolean {
  if (err == null) return false;
  const msg = err instanceof Error ? err.message : String(err);
  if (/FAILED_PRECONDITION|requires an index/i.test(msg)) return true;
  if (typeof err === "object") {
    const o = err as { code?: number | string; message?: string };
    if (o.code === 9 || o.code === "failed-precondition" || o.code === "FAILED_PRECONDITION") return true;
  }
  return false;
}

function docToIncomeRow(doc: QueryDocumentSnapshot): IncomeHistoryDoc & { id: string } {
  const d = doc.data() as IncomeHistoryDoc;
  return { id: doc.id, ...d };
}

function sortIncomeRowsDesc(rows: (IncomeHistoryDoc & { id: string })[]) {
  rows.sort((a, b) => toIso(b.date as Timestamp).localeCompare(toIso(a.date as Timestamp)));
}

async function listIncomeHistoryForUserFallback(
  userId: string,
  opts: { limit: number; cursor?: string | null },
): Promise<IncomeHistoryListResult> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const snap = await db.collection("incomeHistory").where("userId", "==", userId).get();
  const rows = snap.docs.map((doc) => docToIncomeRow(doc));
  sortIncomeRowsDesc(rows);

  let startIdx = 0;
  if (opts.cursor) {
    const idx = rows.findIndex((r) => r.id === opts.cursor);
    if (idx >= 0) startIdx = idx + 1;
  }

  const slice = rows.slice(startIdx, startIdx + limit + 1);
  const hasMore = slice.length > limit;
  const page = hasMore ? slice.slice(0, limit) : slice;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
  return { items: page, nextCursor };
}

/**
 * User income history: only `where userId ==` (no composite index).
 * Sort + pagination in memory — same results as orderBy(date), works before indexes are deployed.
 */
export async function listIncomeHistoryForUser(
  userId: string,
  opts: { limit: number; cursor?: string | null },
): Promise<IncomeHistoryListResult> {
  return listIncomeHistoryForUserFallback(userId, opts);
}

async function listIncomeHistoryAdminFallback(
  opts: { userId?: string | null; limit: number; cursor?: string | null },
): Promise<IncomeHistoryListResult> {
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  let snap;
  if (opts.userId) {
    snap = await db.collection("incomeHistory").where("userId", "==", opts.userId).get();
  } else {
    snap = await db.collection("incomeHistory").get();
  }
  const rows = snap.docs.map((doc) => docToIncomeRow(doc));
  sortIncomeRowsDesc(rows);

  let startIdx = 0;
  if (opts.cursor) {
    const idx = rows.findIndex((r) => r.id === opts.cursor);
    if (idx >= 0) startIdx = idx + 1;
  }

  const slice = rows.slice(startIdx, startIdx + limit + 1);
  const hasMore = slice.length > limit;
  const page = hasMore ? slice.slice(0, limit) : slice;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
  return { items: page, nextCursor };
}

export async function listIncomeHistoryAdmin(opts: {
  userId?: string | null;
  limit: number;
  cursor?: string | null;
}): Promise<IncomeHistoryListResult> {
  if (opts.userId) {
    return listIncomeHistoryAdminFallback(opts);
  }

  const limit = Math.min(Math.max(opts.limit, 1), 100);
  try {
    let q = db.collection("incomeHistory").orderBy("date", "desc").limit(limit + 1);

    if (opts.cursor) {
      const cur = await db.collection("incomeHistory").doc(opts.cursor).get();
      if (cur.exists) q = q.startAfter(cur);
    }

    const snap = await q.get();
    const docs = snap.docs;
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const items = page.map((doc) => docToIncomeRow(doc));
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return { items, nextCursor };
  } catch (e) {
    if (!isFirestoreIndexError(e)) throw e;
    return listIncomeHistoryAdminFallback(opts);
  }
}

export { db };
