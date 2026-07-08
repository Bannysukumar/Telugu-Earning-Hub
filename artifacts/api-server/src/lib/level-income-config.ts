import type { DocumentData } from "firebase-admin/firestore";
import type { SettingsDoc } from "./firestore-db.js";

export type LevelIncomeTier = {
  /** 1 = direct sponsor, 2 = sponsor's sponsor, … */
  level: number;
  /** Percent of downline's credited daily ROI paid at this generation. */
  percent: number;
};

export const MAX_LEVEL_INCOME_TIERS = 32;

export const DEFAULT_LEVEL_INCOME_TIERS: LevelIncomeTier[] = [{ level: 1, percent: 5 }];

export function parseLevelIncomeTiers(raw: unknown): LevelIncomeTier[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LEVEL_INCOME_TIERS];
  const out: LevelIncomeTier[] = [];
  const seen = new Set<number>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const level = Math.round(Number(r.level));
    const percent = Math.round(Number(r.percent));
    if (!Number.isFinite(level) || level < 1 || level > MAX_LEVEL_INCOME_TIERS) continue;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue;
    if (seen.has(level)) continue;
    seen.add(level);
    out.push({ level, percent });
  }
  if (out.length === 0) return [...DEFAULT_LEVEL_INCOME_TIERS];
  out.sort((a, b) => a.level - b.level);
  return out.slice(0, MAX_LEVEL_INCOME_TIERS);
}

export function levelIncomeTiersFromSettingsData(data: DocumentData | undefined): LevelIncomeTier[] {
  if (!data) return [...DEFAULT_LEVEL_INCOME_TIERS];
  return parseLevelIncomeTiers((data as Partial<SettingsDoc>).levelIncomeTiers);
}

/** Percent for upline generation `level` (1-based), or 0 if not configured. */
export function percentForLevel(tiers: LevelIncomeTier[], level: number): number {
  const row = tiers.find((t) => t.level === level);
  if (!row || row.percent <= 0) return 0;
  return row.percent;
}

export function validateLevelIncomeTiersInput(raw: unknown): { ok: true; tiers: LevelIncomeTier[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Add at least one level with a percentage." };
  }
  if (raw.length > MAX_LEVEL_INCOME_TIERS) {
    return { ok: false, error: `At most ${MAX_LEVEL_INCOME_TIERS} levels allowed.` };
  }
  const tiers = parseLevelIncomeTiers(raw);
  if (tiers.length !== raw.length) {
    return { ok: false, error: "Each level needs a unique level number (1–32) and percent 0–100." };
  }
  const hasPositive = tiers.some((t) => t.percent > 0);
  if (!hasPositive) {
    return { ok: false, error: "At least one level must have a percent greater than 0." };
  }
  return { ok: true, tiers };
}
