import { apiUrl } from "@/lib/api-url";

async function growthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("roi_token") : null;
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export type GrowthDashboard = {
  settings: {
    planName: string;
    planAmount: number;
    planDuration: number;
    dailyRoi: number;
    maxEarnings: number;
    directBonus: number;
    minWithdrawal: number;
    enableReentry: boolean;
  };
  planStatus: string;
  planAmount: number;
  planStartDate: string | null;
  planEndDate: string | null;
  remainingDays: number;
  todaysRoi: number;
  currentPlanIncome: number;
  maxEarnings: number;
  progressPct: number;
  lifetimeIncome: number;
  roiIncome: number;
  directIncome: number;
  withdrawableBalance: number;
  walletBalance: number;
  totalDirects: number;
  activeDirects: number;
  isEligibleWithdrawal: boolean;
  canReEnter: boolean;
  reEntryCount: number;
  currentCycle: number;
  referralCode: string;
  referralLink: string;
  directs: Array<{ id: string; name: string; email: string; planStatus: string }>;
};

export type GrowthWithdrawalEligibility = {
  appliesGrowthRules: boolean;
  eligible: boolean;
  reason: string | null;
  minWithdrawal: number;
  walletBalance: number;
  planStatus: string | null;
  activeDirects: number;
  requiredDirects: number;
  totalDirects: number;
  amountNeeded: number;
  blockers: string[];
};

export type GrowthAdminSettings = {
  planName: string;
  planAmount: number;
  planDuration: number;
  dailyRoi: number;
  maxEarnings: number;
  directBonus: number;
  minWithdrawal?: number;
  planStatus: "active" | "inactive";
  enableReentry: boolean;
  enableRoi: boolean;
  enableReferralBonus: boolean;
};

export function getGrowthPlanSettingsPublic() {
  return growthFetch<GrowthAdminSettings>("/api/growth-plan/settings");
}

export function getGrowthDashboard() {
  return growthFetch<GrowthDashboard>("/api/growth-plan/dashboard");
}

export function activateGrowthPlan() {
  return growthFetch<{ cycleId: string; cycleNumber: number; dashboard: GrowthDashboard }>(
    "/api/growth-plan/activate",
    { method: "POST" },
  );
}

export function reEnterGrowthPlan() {
  return growthFetch<{ cycleId: string; cycleNumber: number; dashboard: GrowthDashboard }>(
    "/api/growth-plan/re-enter",
    { method: "POST" },
  );
}

export function giftGrowthPlan(beneficiaryUserId: string) {
  return growthFetch<{
    cycleId: string;
    cycleNumber: number;
    beneficiaryUserId: string;
    beneficiaryName: string;
    dashboard: GrowthDashboard | null;
  }>("/api/growth-plan/gift", {
    method: "POST",
    body: JSON.stringify({ beneficiaryUserId }),
  });
}

export function getGrowthWithdrawalEligibility(amount: number) {
  return growthFetch<GrowthWithdrawalEligibility>(
    `/api/growth-plan/withdrawal-eligibility?amount=${encodeURIComponent(String(amount))}`,
  );
}

export function getWithdrawalEligibilityStatus(amount = 0) {
  const q = amount > 0 ? `?amount=${encodeURIComponent(String(amount))}` : "";
  return growthFetch<GrowthWithdrawalEligibility>(`/api/withdrawals/eligibility-status${q}`);
}

export function getAdminGrowthSettings() {
  return growthFetch<GrowthAdminSettings>("/api/admin/growth-plan/settings");
}

export function updateAdminGrowthSettings(data: Partial<GrowthAdminSettings>) {
  return growthFetch<GrowthAdminSettings>("/api/admin/growth-plan/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function migrateGrowthUsers() {
  return growthFetch<{ message: string; updated: number }>("/api/admin/growth-plan/migrate-users", {
    method: "POST",
  });
}

export function adminActivateGrowthPlan(userId: string, deductFromWallet = false) {
  return growthFetch<{
    cycleId: string;
    cycleNumber: number;
    userId: string;
    deductFromWallet: boolean;
    planStatus: string;
  }>("/api/admin/growth-plan/activate", {
    method: "POST",
    body: JSON.stringify({ userId, deductFromWallet }),
  });
}

export function adminInactivateGrowthPlan(userId: string) {
  return growthFetch<{
    cycleId: string | null;
    cycleNumber: number;
    planStatus: string;
    userId: string;
  }>("/api/admin/growth-plan/inactivate", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}
