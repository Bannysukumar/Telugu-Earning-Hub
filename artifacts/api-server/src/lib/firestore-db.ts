import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { sanitizeUpiIds } from "./upi.js";
import { admin } from "./firebase-admin.js";
import { levelIncomeTiersFromSettingsData } from "./level-income-config.js";

const db: Firestore = getFirestore(admin.app());

/** Firestore `in` queries allow at most 30 values per field. */
const FIRESTORE_IN_MAX = 30;

function chunkIds<T>(ids: T[], size = FIRESTORE_IN_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

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
  /** Uppercase shareable code for referral links. */
  referralCode?: string;
  /** Direct sponsor (same as invite referrer). */
  referrerId?: string | null;
  /** Binary tree upline node. */
  binaryParentId?: string | null;
  binarySide?: "left" | "right" | null;
  /** Unmatched business volume (₹) on each binary leg for pairing. */
  binaryLeftBV?: number;
  binaryRightBV?: number;
  /** Direct referrals who have activated at least one investment. */
  qualifiedDirectReferrals?: number;
  /** Set when member activates any standalone plan. */
  hasStandaloneInvestment?: boolean;
  /** Saved payout accounts for withdrawals (max {@link MAX_SAVED_BANK_ACCOUNTS}). */
  savedBankAccounts?: SavedBankAccountDoc[];
  /** When set (0–100), overrides global withdrawal fee for this member only. */
  withdrawalFeePercent?: number;
  /** Smart Growth Plan — sponsor id (mirrors referrerId when using growth referrals). */
  referredBy?: string | null;
  /** Smart Growth Plan — one-time direct bonus already paid for this user. */
  directBonusPaid?: boolean;
  /** Smart Growth Plan cycle state. */
  growthPlan?: Record<string, unknown>;
};

const MAX_SAVED_BANK_ACCOUNTS = 10;

export type SavedBankAccountDoc = {
  id: string;
  label?: string;
  bankName: string;
  ifscCode: string;
  accountNumber: string;
  accountHolderName: string;
  createdAt: Timestamp;
};

function normalizeBankAccountKey(ifscCode: string, accountNumber: string): string {
  return `${ifscCode.trim().toUpperCase().replace(/\s/g, "")}:${accountNumber.replace(/\s/g, "")}`;
}

export function parseSavedBankAccounts(data: UserDoc): SavedBankAccountDoc[] {
  const raw = data.savedBankAccounts;
  if (!Array.isArray(raw)) return [];
  const out: SavedBankAccountDoc[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    const bankName = String(r.bankName ?? "").trim();
    const ifscCode = String(r.ifscCode ?? "").trim().toUpperCase().replace(/\s/g, "");
    const accountNumber = String(r.accountNumber ?? "").trim().replace(/\s/g, "");
    const accountHolderName = String(r.accountHolderName ?? "").trim();
    if (!bankName || !ifscCode || !accountNumber || !accountHolderName) continue;
    const createdRaw = r.createdAt;
    const createdAt =
      createdRaw instanceof Timestamp ? createdRaw : Timestamp.fromMillis(Date.now());
    const labelRaw = r.label;
    const label = typeof labelRaw === "string" && labelRaw.trim() !== "" ? labelRaw.trim() : undefined;
    out.push({ id, label, bankName, ifscCode, accountNumber, accountHolderName, createdAt });
  }
  return out;
}

export function bankDetailsMultilineFromSaved(
  a: Pick<SavedBankAccountDoc, "bankName" | "ifscCode" | "accountNumber" | "accountHolderName">,
): string {
  return [
    `Bank: ${a.bankName}`,
    `IFSC: ${a.ifscCode}`,
    `Account: ${a.accountNumber}`,
    `Account holder: ${a.accountHolderName}`,
  ].join("\n");
}

export function findSavedBankAccountById(user: UserDoc, accountId: string): SavedBankAccountDoc | null {
  const id = accountId.trim();
  if (!id) return null;
  return parseSavedBankAccounts(user).find((x) => x.id === id) ?? null;
}

export async function listSavedBankAccounts(userId: string): Promise<SavedBankAccountDoc[]> {
  const u = await getUser(userId);
  if (!u) return [];
  return parseSavedBankAccounts(u);
}

export async function replaceSavedBankAccounts(userId: string, list: SavedBankAccountDoc[]): Promise<void> {
  await updateUser(userId, { savedBankAccounts: list } as Partial<UserDoc>);
}

export class BankAccountLimitError extends Error {
  constructor() {
    super(`You can save at most ${MAX_SAVED_BANK_ACCOUNTS} bank accounts. Remove one to add another.`);
    this.name = "BankAccountLimitError";
  }
}

export class DuplicateSavedBankAccountError extends Error {
  constructor() {
    super("Another saved account already uses this IFSC and account number.");
    this.name = "DuplicateSavedBankAccountError";
  }
}

/** Insert or merge by IFSC + account number (same key updates in place). */
export async function upsertSavedBankAccountForUser(
  userId: string,
  fields: {
    bankName: string;
    ifscCode: string;
    accountNumber: string;
    accountHolderName: string;
    label?: string;
  },
): Promise<SavedBankAccountDoc> {
  const u = await getUser(userId);
  if (!u) {
    throw new Error("USER_NOT_FOUND");
  }
  const list = parseSavedBankAccounts(u);
  const ifsc = fields.ifscCode.trim().toUpperCase().replace(/\s/g, "");
  const acct = fields.accountNumber.trim().replace(/\s/g, "");
  const key = normalizeBankAccountKey(ifsc, acct);
  const existingIdx = list.findIndex((x) => normalizeBankAccountKey(x.ifscCode, x.accountNumber) === key);
  if (existingIdx >= 0) {
    const prev = list[existingIdx]!;
    list[existingIdx] = {
      ...prev,
      bankName: fields.bankName.trim(),
      ifscCode: ifsc,
      accountNumber: acct,
      accountHolderName: fields.accountHolderName.trim(),
      label: fields.label?.trim() || prev.label,
    };
    await replaceSavedBankAccounts(userId, list);
    return list[existingIdx]!;
  }
  if (list.length >= MAX_SAVED_BANK_ACCOUNTS) {
    throw new BankAccountLimitError();
  }
  const id = randomBytes(12).toString("hex");
  const row: SavedBankAccountDoc = {
    id,
    label: fields.label?.trim() || undefined,
    bankName: fields.bankName.trim(),
    ifscCode: ifsc,
    accountNumber: acct,
    accountHolderName: fields.accountHolderName.trim(),
    createdAt: Timestamp.fromMillis(Date.now()),
  };
  list.push(row);
  await replaceSavedBankAccounts(userId, list);
  return row;
}

export async function updateSavedBankAccountById(
  userId: string,
  accountId: string,
  fields: {
    bankName?: string;
    ifscCode?: string;
    accountNumber?: string;
    accountHolderName?: string;
    label?: string | null;
  },
): Promise<SavedBankAccountDoc | null> {
  const u = await getUser(userId);
  if (!u) return null;
  const list = parseSavedBankAccounts(u);
  const idx = list.findIndex((x) => x.id === accountId);
  if (idx < 0) return null;
  const cur = list[idx]!;
  const next: SavedBankAccountDoc = { ...cur };
  if (fields.bankName !== undefined) next.bankName = fields.bankName.trim();
  if (fields.ifscCode !== undefined) {
    next.ifscCode = fields.ifscCode.trim().toUpperCase().replace(/\s/g, "");
  }
  if (fields.accountNumber !== undefined) next.accountNumber = fields.accountNumber.trim().replace(/\s/g, "");
  if (fields.accountHolderName !== undefined) next.accountHolderName = fields.accountHolderName.trim();
  if (fields.label !== undefined && fields.label !== null) {
    const t = fields.label.trim();
    next.label = t || undefined;
  } else if (fields.label === null) {
    next.label = undefined;
  }
  const key = normalizeBankAccountKey(next.ifscCode, next.accountNumber);
  if (list.some((x, i) => i !== idx && normalizeBankAccountKey(x.ifscCode, x.accountNumber) === key)) {
    throw new DuplicateSavedBankAccountError();
  }
  list[idx] = next;
  await replaceSavedBankAccounts(userId, list);
  return next;
}

export async function deleteSavedBankAccount(userId: string, accountId: string): Promise<boolean> {
  const u = await getUser(userId);
  if (!u) return false;
  const list = parseSavedBankAccounts(u);
  const next = list.filter((x) => x.id !== accountId);
  if (next.length === list.length) return false;
  await replaceSavedBankAccounts(userId, next);
  return true;
}

export type PlanKind = "mlm" | "standalone";

export type PlanDoc = {
  name: string;
  amount: number;
  dailyRoi: number;
  maxReturn: number;
  maxDays: number;
  description: string | null;
  isActive: boolean;
  /** `standalone` = ROI only: no referral/binary MLM, no gift activation, relaxed withdrawal gate. */
  planKind?: PlanKind;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** ₹ paid to direct sponsor on referral's first investment (default 20). */
  directBonus?: number;
  /** BV required on each leg to form one binary pair (default 200). */
  binaryPairVolume?: number;
  /** ₹ paid to upline per binary pair formed (default 80). */
  binaryPairPayout?: number;
  /** Percent of plan dailyRoi credited each ROI day, 1–100 (default 100). */
  roiPoolPercent?: number;
  /** When true, uplines earn level-income on downline daily ROI (MLM plans only). */
  levelIncomeEnabled?: boolean;
  /** Optional per-plan level schedule; when set, overrides global settings for this plan. */
  levelIncomeTiers?: { level: number; percent: number }[];
};

export type ManualStatus = "active" | "inactive";

export type InvestmentDoc = {
  userId: string;
  planId: string;
  amount: number;
  dailyRoi: number;
  /** Snapshot from plan at activation; percent of dailyRoi paid each ROI day (1–100). */
  roiPoolPercent?: number;
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
  /** Applied to peer wallet sends and sponsored (gift) plan activations; 0–100, default 0 when unset. */
  peerTransferFeePercent?: number;
  /** When false, binary leg signup, tree views, and binary pair payouts are disabled site-wide. */
  binaryPlanEnabled?: boolean;
  /** When false, direct referral bonus payouts and per-plan direct bonus fields are disabled. */
  directIncomeEnabled?: boolean;
  /** When true, admin Create Plan only allows standalone (ROI-only) packages — no MLM fields. */
  standalonePlanCreationOnly?: boolean;
  /** Global level-income schedule (level 1 = direct sponsor). Used by plans with levelIncomeEnabled. */
  levelIncomeTiers?: { level: number; percent: number }[];
  /** When true, admin Create Plan enables level income by default (can be turned off per plan). */
  defaultLevelIncomeOnNewPlans?: boolean;
  /** Minimum gross withdrawal request amount in ₹ (default 100 when unset). */
  minWithdrawalAmount?: number;
  updatedAt: Timestamp;
};

export const DEFAULT_MIN_WITHDRAWAL_AMOUNT = 100;

/** Firestore `settings/{id}` document id for withdrawal + peer/gift fee percentages. */
export const GLOBAL_SETTINGS_DOC_ID = "global";
const SETTINGS_GLOBAL_ID = GLOBAL_SETTINGS_DOC_ID;

export type DepositMethod = "legacy_qr" | "dynamic_upi";

export type PaymentSettingsDoc = {
  qrCodeImageUrl: string;
  isPaymentEnabled: boolean;
  /** `dynamic_upi` = amount-specific UPI link + QR; `legacy_qr` = static uploaded QR image. */
  depositMethod: DepositMethod;
  upiIds: string[];
  payeeName: string;
  updatedAt: Timestamp;
};

export type DepositDoc = {
  userId: string;
  amount: number;
  transactionId: string;
  screenshotUrl: string;
  note: string | null;
  payeeUpiId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
};

const PAYMENT_SETTINGS_GLOBAL_ID = "global";

const PAYMENT_SETTINGS_DEFAULT: Omit<PaymentSettingsDoc, "updatedAt"> = {
  qrCodeImageUrl: "",
  isPaymentEnabled: false,
  depositMethod: "dynamic_upi",
  upiIds: [],
  payeeName: "Telugu Earning Hub",
};

export function normalizeDepositTransactionId(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function mapPaymentSettingsDoc(snap: DocumentSnapshot): {
  id: string;
  qrCodeImageUrl: string;
  isPaymentEnabled: boolean;
  depositMethod: DepositMethod;
  upiIds: string[];
  payeeName: string;
  updatedAt: string | null;
} {
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
  const depositMethod: DepositMethod =
    d.depositMethod === "legacy_qr" || d.depositMethod === "dynamic_upi"
      ? d.depositMethod
      : qrCodeImageUrl
        ? "legacy_qr"
        : "dynamic_upi";
  const upiIds = Array.isArray(d.upiIds)
    ? d.upiIds.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean)
    : [];
  const payeeName =
    typeof d.payeeName === "string" && d.payeeName.trim() ? d.payeeName.trim() : PAYMENT_SETTINGS_DEFAULT.payeeName;
  const updatedAt = d.updatedAt as Timestamp | undefined;
  return {
    id: snap.id,
    qrCodeImageUrl,
    isPaymentEnabled,
    depositMethod,
    upiIds,
    payeeName,
    updatedAt: updatedAt ? toIso(updatedAt) : null,
  };
}

export async function getPaymentSettings(): Promise<ReturnType<typeof mapPaymentSettingsDoc>> {
  const snap = await db.collection("paymentSettings").doc(PAYMENT_SETTINGS_GLOBAL_ID).get();
  return mapPaymentSettingsDoc(snap);
}

export async function updatePaymentSettings(
  patch: Partial<Pick<PaymentSettingsDoc, "qrCodeImageUrl" | "isPaymentEnabled" | "depositMethod" | "upiIds" | "payeeName">>,
): Promise<void> {
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
    payeeUpiId: data.payeeUpiId != null ? String(data.payeeUpiId) : null,
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
  | "PAYMENTS_NOT_CONFIGURED"
  | "PENDING_DEPOSIT_EXISTS"
  | "DUPLICATE_TRANSACTION_ID"
  | "PROOF_REQUIRED"
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
  payeeUpiId?: string | null;
}): Promise<string> {
  const { userId, amount, transactionId, screenshotUrl, note, payeeUpiId = null } = params;
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
      throw new DepositRequestError("Deposits are currently disabled.", "PAYMENTS_DISABLED");
    }

    const settings = settingsSnap.exists ? (settingsSnap.data() as Partial<PaymentSettingsDoc>) : {};
    const method: DepositMethod =
      settings.depositMethod === "legacy_qr" || settings.depositMethod === "dynamic_upi"
        ? settings.depositMethod
        : settings.qrCodeImageUrl
          ? "legacy_qr"
          : "dynamic_upi";
    const upiIds = sanitizeUpiIds(settings.upiIds);
    const legacyOk = Boolean(settings.qrCodeImageUrl?.trim());
    const dynamicOk = upiIds.length > 0;
    if (method === "legacy_qr" && !legacyOk) {
      throw new DepositRequestError("Deposit QR is not configured yet.", "PAYMENTS_NOT_CONFIGURED");
    }
    if (method === "dynamic_upi" && !dynamicOk) {
      throw new DepositRequestError("No UPI IDs configured for deposits.", "PAYMENTS_NOT_CONFIGURED");
    }

    if (!transactionId && !screenshotUrl) {
      throw new DepositRequestError(
        "Provide your UPI transaction reference (UTR) or upload a payment screenshot.",
        "PROOF_REQUIRED",
      );
    }

    const pendingQ = depositsCol.where("userId", "==", userId).where("status", "==", "pending");
    const pendingSnap = await tx.get(pendingQ);
    if (!pendingSnap.empty) {
      throw new DepositRequestError(
        "Your previous request is pending. Please wait for admin approval.",
        "PENDING_DEPOSIT_EXISTS",
      );
    }

    if (transactionId) {
      const tidQ = depositsCol.where("transactionId", "==", transactionId);
      const tidSnap = await tx.get(tidQ);
      if (!tidSnap.empty) {
        throw new DepositRequestError(
          "This transaction ID has already been used. Please check and try again.",
          "DUPLICATE_TRANSACTION_ID",
        );
      }
    }

    const ref = depositsCol.doc();
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      userId,
      amount,
      transactionId,
      screenshotUrl,
      note,
      payeeUpiId: payeeUpiId?.trim() || null,
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

export function withdrawalFeePercentFromSettingsData(data: DocumentData | undefined): number {
  if (!data) return 10;
  const raw = (data as Partial<SettingsDoc>).withdrawalFeePercent;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 100) return 10;
  return v;
}

/** Per-user override, or null when member uses the global fee. */
export function userWithdrawalFeePercentOverride(data: UserDoc | DocumentData | undefined): number | null {
  if (!data) return null;
  if (!Object.prototype.hasOwnProperty.call(data as object, "withdrawalFeePercent")) return null;
  const v = Number((data as UserDoc).withdrawalFeePercent);
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}

export function resolveWithdrawalFeePercent(
  userData: UserDoc | DocumentData | undefined,
  settingsData: DocumentData | undefined,
): number {
  const custom = userWithdrawalFeePercentOverride(userData);
  if (custom !== null) return custom;
  return withdrawalFeePercentFromSettingsData(settingsData);
}

export async function getWithdrawalFeePercent(): Promise<number> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return withdrawalFeePercentFromSettingsData(snap.data());
}

export async function getWithdrawalFeePercentForUser(userId: string): Promise<{
  effectivePercent: number;
  globalPercent: number;
  customPercent: number | null;
}> {
  const [user, globalPercent] = await Promise.all([getUser(userId), getWithdrawalFeePercent()]);
  const customPercent = user ? userWithdrawalFeePercentOverride(user) : null;
  return {
    effectivePercent: customPercent ?? globalPercent,
    globalPercent,
    customPercent,
  };
}

export async function setUserWithdrawalFeePercent(userId: string, percent: number): Promise<void> {
  await updateUser(userId, { withdrawalFeePercent: percent });
}

export async function clearUserWithdrawalFeePercent(userId: string): Promise<void> {
  await db.collection("users").doc(userId).update({
    withdrawalFeePercent: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Parse peer/gift fee % from a settings document snapshot (transaction-safe). */
export function peerTransferFeePercentFromSettingsData(data: DocumentData | undefined): number {
  if (!data) return 0;
  const raw = (data as Partial<SettingsDoc>).peerTransferFeePercent;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 100) return 0;
  return v;
}

export async function getPeerTransferFeePercent(): Promise<number> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return peerTransferFeePercentFromSettingsData(snap.data());
}

/** Default true when unset — existing deployments keep binary until admin turns it off. */
export function binaryPlanEnabledFromSettingsData(data: DocumentData | undefined): boolean {
  if (!data) return true;
  const v = (data as Partial<SettingsDoc>).binaryPlanEnabled;
  return typeof v === "boolean" ? v : true;
}

export async function getBinaryPlanEnabled(): Promise<boolean> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return binaryPlanEnabledFromSettingsData(snap.data());
}

/** Default true when unset — existing deployments keep direct referral bonus until admin turns it off. */
export function directIncomeEnabledFromSettingsData(data: DocumentData | undefined): boolean {
  if (!data) return true;
  const v = (data as Partial<SettingsDoc>).directIncomeEnabled;
  return typeof v === "boolean" ? v : true;
}

export async function getDirectIncomeEnabled(): Promise<boolean> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return directIncomeEnabledFromSettingsData(snap.data());
}

/** Default false — admin can create MLM or standalone plans until this is turned on. */
export function standalonePlanCreationOnlyFromSettingsData(data: DocumentData | undefined): boolean {
  if (!data) return false;
  const v = (data as Partial<SettingsDoc>).standalonePlanCreationOnly;
  return typeof v === "boolean" ? v : false;
}

export async function getStandalonePlanCreationOnly(): Promise<boolean> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return standalonePlanCreationOnlyFromSettingsData(snap.data());
}

export async function getLevelIncomeTiers(): Promise<{ level: number; percent: number }[]> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return levelIncomeTiersFromSettingsData(snap.data());
}

export function defaultLevelIncomeOnNewPlansFromSettingsData(data: DocumentData | undefined): boolean {
  if (!data) return false;
  const v = (data as Partial<SettingsDoc>).defaultLevelIncomeOnNewPlans;
  return typeof v === "boolean" ? v : false;
}

export async function getDefaultLevelIncomeOnNewPlans(): Promise<boolean> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return defaultLevelIncomeOnNewPlansFromSettingsData(snap.data());
}

export function minWithdrawalAmountFromSettingsData(data: DocumentData | undefined): number {
  if (!data) return DEFAULT_MIN_WITHDRAWAL_AMOUNT;
  const v = Number((data as Partial<SettingsDoc>).minWithdrawalAmount);
  if (!Number.isFinite(v) || v < 1) return DEFAULT_MIN_WITHDRAWAL_AMOUNT;
  return Math.round(v);
}

export async function getMinWithdrawalAmount(): Promise<number> {
  const snap = await db.collection("settings").doc(SETTINGS_GLOBAL_ID).get();
  return minWithdrawalAmountFromSettingsData(snap.data());
}

export async function setMinWithdrawalAmount(amount: number): Promise<void> {
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("Minimum withdrawal must be at least ₹1");
  }
  await patchGlobalSettings({ minWithdrawalAmount: n });
}

export async function setLevelIncomeTiers(tiers: { level: number; percent: number }[]): Promise<void> {
  await patchGlobalSettings({ levelIncomeTiers: tiers });
}

export async function patchGlobalSettings(
  patch: Partial<
    Pick<
      SettingsDoc,
      | "withdrawalFeePercent"
      | "peerTransferFeePercent"
      | "binaryPlanEnabled"
      | "directIncomeEnabled"
      | "standalonePlanCreationOnly"
      | "levelIncomeTiers"
      | "defaultLevelIncomeOnNewPlans"
      | "minWithdrawalAmount"
    >
  >,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await db.collection("settings").doc(SETTINGS_GLOBAL_ID).set(
    {
      ...Object.fromEntries(entries),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function setWithdrawalFeePercent(percent: number): Promise<void> {
  await patchGlobalSettings({ withdrawalFeePercent: percent });
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
  type:
    | "ROI"
    | "ADJUSTMENT"
    | "WITHDRAWAL"
    | "INVESTMENT"
    | "REFERRAL_BONUS"
    | "BINARY_PAIR"
    | "LEVEL_INCOME"
    | "GROWTH_ROI"
    | "GROWTH_DIRECT";
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

  const roiPoolRaw = data.roiPoolPercent;
  const roiPoolPercent =
    typeof roiPoolRaw === "number" && Number.isFinite(roiPoolRaw)
      ? Math.min(100, Math.max(1, Math.round(roiPoolRaw)))
      : undefined;

  return {
    id,
    userId: String(data.userId),
    planId: String(data.planId),
    amount: Number(data.amount),
    dailyRoi: Number(data.dailyRoi),
    ...(roiPoolPercent !== undefined ? { roiPoolPercent } : {}),
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

export function savedBankAccountToResponse(a: SavedBankAccountDoc): {
  id: string;
  label: string | null;
  bankName: string;
  ifscCode: string;
  accountNumber: string;
  accountHolderName: string;
  createdAt: string;
} {
  return {
    id: a.id,
    label: a.label ?? null,
    bankName: a.bankName,
    ifscCode: a.ifscCode,
    accountNumber: a.accountNumber,
    accountHolderName: a.accountHolderName,
    createdAt: toIso(a.createdAt),
  };
}

export async function getUser(uid: string): Promise<(UserDoc & { id: string }) | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() as UserDoc;
  return { id: snap.id, ...d };
}

/** Resolve a profile by email (Firestore match + case-insensitive Auth fallback). */
export async function findUserByEmail(email: string): Promise<(UserDoc & { id: string }) | null> {
  const raw = email.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const variants = lower === raw ? [lower] : [lower, raw];
  const snap = await db.collection("users").where("email", "in", variants).limit(10).get();
  for (const doc of snap.docs) {
    const mail = String((doc.data() as UserDoc).email ?? "").toLowerCase();
    if (mail === lower) {
      return { id: doc.id, ...(doc.data() as UserDoc) };
    }
  }

  /** Firestore `==` / `in` on `email` is case-sensitive; Auth resolves the canonical account for this address. */
  const tryAuth = async (addr: string) => {
    try {
      const rec = await admin.auth().getUserByEmail(addr);
      return await getUser(rec.uid);
    } catch {
      return null;
    }
  };

  return (await tryAuth(lower)) ?? (lower !== raw ? await tryAuth(raw) : null);
}

export type PeerTransferResult = {
  feePercent: number;
  feeAmount: number;
  recipientReceived: number;
};

/** Move funds between member wallets (atomic). Sender debits full `amount`; recipient receives net after platform fee (same model as withdrawal fee on gross). */
export async function transferWalletPeerToPeer(
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<PeerTransferResult> {
  if (fromUserId === toUserId) {
    throw new Error("Cannot transfer to yourself.");
  }
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Amount must be at least ₹1.");
  }

  const usersCol = db.collection("users");
  const investmentsCol = db.collection("investments");
  const incomeCol = db.collection("incomeHistory");
  const settingsRef = db.collection("settings").doc(SETTINGS_GLOBAL_ID);
  const fromRef = usersCol.doc(fromUserId);
  const toRef = usersCol.doc(toUserId);
  const senderActivePlanQ = investmentsCol
    .where("userId", "==", fromUserId)
    .where("isActive", "==", true)
    .limit(1);

  let out: PeerTransferResult = { feePercent: 0, feeAmount: 0, recipientReceived: amount };

  await db.runTransaction(async (tx) => {
    const [fromSnap, toSnap, settingsSnap, activePlanSnap] = await Promise.all([
      tx.get(fromRef),
      tx.get(toRef),
      tx.get(settingsRef),
      tx.get(senderActivePlanQ),
    ]);
    if (!fromSnap.exists || !toSnap.exists) {
      throw new Error("User not found.");
    }
    const from = fromSnap.data() as UserDoc;
    const to = toSnap.data() as UserDoc;
    const hasMlmPlan = !activePlanSnap.empty;
    const hasGrowthPlan =
      (from as UserDoc & { growthPlan?: { planStatus?: string } }).growthPlan?.planStatus === "active";
    if (!hasMlmPlan && !hasGrowthPlan) {
      throw new Error("You need an active investment plan on your account before sending funds to another member.");
    }
    if (!from.isActive || !to.isActive) {
      throw new Error("Both accounts must be active.");
    }
    if (from.role === "admin" || to.role === "admin") {
      throw new Error("Transfers involving admin accounts are not allowed.");
    }
    const feePct = peerTransferFeePercentFromSettingsData(settingsSnap.data());
    const feeAmount = Math.round((amount * feePct) / 100);
    const recipientReceived = amount - feeAmount;
    out = { feePercent: feePct, feeAmount, recipientReceived };

    const bal = Number(from.walletBalance ?? 0);
    if (bal < amount) {
      throw new Error("Insufficient wallet balance.");
    }

    tx.update(fromRef, {
      walletBalance: bal - amount,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(toRef, {
      walletBalance: Number(to.walletBalance ?? 0) + recipientReceived,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nFrom = from.name?.trim() || "Member";
    const nTo = to.name?.trim() || "Member";
    const feeNote = feeAmount > 0 ? ` · platform fee ${feePct}% (₹${feeAmount})` : "";
    tx.set(incomeCol.doc(), {
      userId: fromUserId,
      investmentId: INCOME_PEER_TRANSFER_ID,
      amount: -amount,
      type: "ADJUSTMENT",
      planAmount: 0,
      dayNumber: 0,
      ...(feeAmount > 0 ? { feeAmount } : {}),
      note: `Peer transfer to ${nTo} (${toUserId})${feeNote}`,
      date: FieldValue.serverTimestamp(),
    });
    tx.set(incomeCol.doc(), {
      userId: toUserId,
      investmentId: INCOME_PEER_TRANSFER_ID,
      amount: recipientReceived,
      type: "ADJUSTMENT",
      planAmount: 0,
      dayNumber: 0,
      ...(feeAmount > 0 ? { feeAmount, netAmount: recipientReceived } : {}),
      note:
        feeAmount > 0
          ? `Peer transfer from ${nFrom} (${fromUserId}) · received ₹${recipientReceived} after ${feePct}% fee`
          : `Peer transfer from ${nFrom} (${fromUserId})`,
      date: FieldValue.serverTimestamp(),
    });
  });

  return out;
}

/** Users who joined with this member as direct sponsor (referrer). */
export async function listDirectReferralsByReferrerId(
  referrerId: string,
): Promise<(UserDoc & { id: string })[]> {
  const snap = await db.collection("users").where("referrerId", "==", referrerId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as UserDoc) }));
}

/** Direct referrals for many sponsors in parallel batched `in` queries. */
export async function listDirectReferralsByReferrerIds(
  referrerIds: string[],
): Promise<(UserDoc & { id: string })[]> {
  const unique = [...new Set(referrerIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const snaps = await Promise.all(
    chunkIds(unique).map((chunk) =>
      db.collection("users").where("referrerId", "in", chunk).get(),
    ),
  );

  const seen = new Set<string>();
  const out: (UserDoc & { id: string })[] = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      out.push({ id: doc.id, ...(doc.data() as UserDoc) });
    }
  }
  return out;
}

/** Binary tree children placed under this parent node. */
export async function listBinaryChildrenByParentId(
  binaryParentId: string,
): Promise<(UserDoc & { id: string })[]> {
  const snap = await db.collection("users").where("binaryParentId", "==", binaryParentId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as UserDoc) }));
}

/** Binary children for many parents in parallel batched `in` queries. */
export async function listBinaryChildrenByParentIds(
  parentIds: string[],
): Promise<(UserDoc & { id: string })[]> {
  const unique = [...new Set(parentIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const snaps = await Promise.all(
    chunkIds(unique).map((chunk) =>
      db.collection("users").where("binaryParentId", "in", chunk).get(),
    ),
  );

  const seen = new Set<string>();
  const out: (UserDoc & { id: string })[] = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      out.push({ id: doc.id, ...(doc.data() as UserDoc) });
    }
  }
  return out;
}

export type CreateUserProfileInput = {
  name: string;
  email: string;
  phone: string;
  role: string;
  walletBalance: number;
  isActive: boolean;
  referralCode: string;
  referrerId?: string | null;
  binaryParentId?: string | null;
  binarySide?: "left" | "right" | null;
  /** Smart Growth Plan — optional sponsor link (same as referrerId when set). */
  referredBy?: string | null;
  directBonusPaid?: boolean;
  growthPlan?: Record<string, unknown>;
};

export async function createUserProfile(uid: string, data: CreateUserProfileInput): Promise<void> {
  const now = FieldValue.serverTimestamp();
  const { growthPlan, referredBy, directBonusPaid, ...rest } = data;
  await db.collection("users").doc(uid).set({
    ...rest,
    referredBy: referredBy ?? rest.referrerId ?? null,
    directBonusPaid: directBonusPaid ?? false,
    ...(growthPlan ? { growthPlan } : {}),
    qualifiedDirectReferrals: 0,
    binaryLeftBV: 0,
    binaryRightBV: 0,
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

/** At least one active MLM investment or an active Smart Growth plan on the member's account. */
export async function userHasActiveInvestment(userId: string): Promise<boolean> {
  const snap = await db
    .collection("investments")
    .where("userId", "==", userId)
    .where("isActive", "==", true)
    .limit(1)
    .get();
  if (!snap.empty) return true;

  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) return false;
  const gp = (userSnap.data() as { growthPlan?: { planStatus?: string } }).growthPlan;
  return gp?.planStatus === "active";
}

/** Investments for many users in parallel batched `in` queries (grouped by userId). */
export async function listInvestmentsByUserIds(
  userIds: string[],
): Promise<Map<string, (InvestmentDoc & { id: string })[]>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const byUser = new Map<string, (InvestmentDoc & { id: string })[]>();
  for (const id of unique) byUser.set(id, []);

  if (unique.length === 0) return byUser;

  const snaps = await Promise.all(
    chunkIds(unique).map((chunk) =>
      db.collection("investments").where("userId", "in", chunk).get(),
    ),
  );

  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const inv = mapInvestmentDoc(doc);
      const list = byUser.get(inv.userId) ?? [];
      list.push(inv);
      byUser.set(inv.userId, list);
    }
  }

  for (const [id, rows] of byUser) {
    rows.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)));
    byUser.set(id, rows);
  }
  return byUser;
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

/** Income history rows for peer-to-peer wallet transfers (no investment doc). */
export const INCOME_PEER_TRANSFER_ID = "__peer_transfer__";

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
  /** Optional override used by Smart Growth Plan withdrawal fee settings. */
  feePercentOverride?: number;
}): Promise<string> {
  const { userId, requestAmount, bankDetails, feePercentOverride } = params;
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
    const feePct =
      typeof feePercentOverride === "number" && Number.isFinite(feePercentOverride)
        ? feePercentOverride
        : resolveWithdrawalFeePercent(user, settingsSnap.data());
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
