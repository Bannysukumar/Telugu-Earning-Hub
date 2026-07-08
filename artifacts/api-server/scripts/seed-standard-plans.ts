/**
 * Create the four standard investment packages (Plan 1–4).
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/seed-standard-plans.ts --
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/seed-standard-plans.ts -- --replace
 */
import {
  createPlan,
  deletePlan,
  listAllPlansOrdered,
  patchGlobalSettings,
  type PlanDoc,
} from "../src/lib/firestore-db.js";
import {
  DEFAULT_BINARY_PAIR_PAYOUT,
  DEFAULT_BINARY_PAIR_VOLUME,
  DEFAULT_PLAN_DIRECT_BONUS,
  DEFAULT_ROI_POOL_PERCENT,
} from "../src/lib/investment-mlm.js";

const PLAN_4_LEVEL_TIERS = [
  { level: 1, percent: 10 },
  { level: 2, percent: 5 },
  { level: 3, percent: 3 },
  { level: 4, percent: 2 },
  { level: 5, percent: 1 },
  { level: 6, percent: 1 },
  { level: 7, percent: 0.5 },
  { level: 8, percent: 0.5 },
  { level: 9, percent: 0.5 },
  { level: 10, percent: 0.5 },
  { level: 11, percent: 0.5 },
  { level: 12, percent: 0.5 },
];

const PACKAGES: Omit<PlanDoc, "createdAt" | "updatedAt">[] = [
  {
    name: "Plan 1 — ₹40,000",
    description: "120 days · 2× return · ROI only (no level income)",
    amount: 40_000,
    dailyRoi: 666.67,
    maxReturn: 80_000,
    maxDays: 120,
    isActive: true,
    planKind: "standalone",
    directBonus: 0,
    binaryPairVolume: 1,
    binaryPairPayout: 0,
    roiPoolPercent: 100,
    levelIncomeEnabled: false,
  },
  {
    name: "Plan 2 — ₹80,000",
    description: "90 days · 2× return · Level income 1–2",
    amount: 80_000,
    dailyRoi: 1777.78,
    maxReturn: 160_000,
    maxDays: 90,
    isActive: true,
    planKind: "mlm",
    directBonus: DEFAULT_PLAN_DIRECT_BONUS,
    binaryPairVolume: DEFAULT_BINARY_PAIR_VOLUME,
    binaryPairPayout: DEFAULT_BINARY_PAIR_PAYOUT,
    roiPoolPercent: DEFAULT_ROI_POOL_PERCENT,
    levelIncomeEnabled: true,
    levelIncomeTiers: [
      { level: 1, percent: 8 },
      { level: 2, percent: 2 },
    ],
  },
  {
    name: "Plan 3 — ₹1,20,000",
    description: "60 days · 2× return · Level income 1–6",
    amount: 120_000,
    dailyRoi: 4000,
    maxReturn: 240_000,
    maxDays: 60,
    isActive: true,
    planKind: "mlm",
    directBonus: DEFAULT_PLAN_DIRECT_BONUS,
    binaryPairVolume: DEFAULT_BINARY_PAIR_VOLUME,
    binaryPairPayout: DEFAULT_BINARY_PAIR_PAYOUT,
    roiPoolPercent: DEFAULT_ROI_POOL_PERCENT,
    levelIncomeEnabled: true,
    levelIncomeTiers: [
      { level: 1, percent: 8 },
      { level: 2, percent: 3 },
      { level: 3, percent: 2 },
      { level: 4, percent: 1 },
      { level: 5, percent: 0.5 },
      { level: 6, percent: 0.5 },
    ],
  },
  {
    name: "Plan 4 — ₹1,80,000",
    description: "40 days · 2× return · Level income 1–12",
    amount: 180_000,
    dailyRoi: 9000,
    maxReturn: 360_000,
    maxDays: 40,
    isActive: true,
    planKind: "mlm",
    directBonus: DEFAULT_PLAN_DIRECT_BONUS,
    binaryPairVolume: DEFAULT_BINARY_PAIR_VOLUME,
    binaryPairPayout: DEFAULT_BINARY_PAIR_PAYOUT,
    roiPoolPercent: DEFAULT_ROI_POOL_PERCENT,
    levelIncomeEnabled: true,
    levelIncomeTiers: PLAN_4_LEVEL_TIERS,
  },
];

async function main() {
  const replace = process.argv.includes("--replace");

  if (replace) {
    const existing = await listAllPlansOrdered();
    for (const p of existing) {
      await deletePlan(p.id);
      console.log(`  Removed plan ${p.id} (${p.name})`);
    }
  }

  console.log("\nCreating plans…\n");
  const ids: string[] = [];
  for (const pkg of PACKAGES) {
    const id = await createPlan(pkg);
    ids.push(id);
    console.log(`  ✓ ${pkg.name} → ${id}`);
    if (pkg.levelIncomeTiers?.length) {
      const tiers = pkg.levelIncomeTiers.map((t) => `L${t.level}:${t.percent}%`).join(", ");
      console.log(`      Level income: ${tiers}`);
    }
  }

  await patchGlobalSettings({
    defaultLevelIncomeOnNewPlans: true,
    levelIncomeTiers: PLAN_4_LEVEL_TIERS,
  });
  console.log("\n  Global level-income default updated (12-level schedule for new MLM plans without custom tiers).");

  console.log(`\nDone. Created ${ids.length} plan(s).\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
