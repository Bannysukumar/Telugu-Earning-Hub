import { apiUrl } from "@/lib/api-url";

async function growthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
};

export type GrowthAdminSettings = {
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

export function getGrowthWithdrawalEligibility(amount: number) {
  return growthFetch<GrowthWithdrawalEligibility>(
    `/api/growth-plan/withdrawal-eligibility?amount=${encodeURIComponent(String(amount))}`,
  );
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
