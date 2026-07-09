/**
 * Inactivate a user's Smart Growth Plan by email.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/inactivate-growth-plan.ts -- maradanamahendra07@gmail.com
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import { findUserByEmail } from "../src/lib/firestore-db.js";
import {
  GROWTH_INCOME_CYCLE_ID,
  normalizeGrowthPlanState,
  getGrowthPlanSettings,
  type GrowthUserDoc,
} from "../src/lib/growth-plan-db.js";

async function main() {
  const email = process.argv
    .slice(2)
    .map((a) => a.trim())
    .filter((a) => a && a !== "--")
    .at(-1)
    ?.toLowerCase();
  if (!email) {
    console.error("Usage: tsx ./scripts/inactivate-growth-plan.ts -- <email>");
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  const settings = await getGrowthPlanSettings();
  const gp = normalizeGrowthPlanState((user as GrowthUserDoc).growthPlan, settings);
  console.log(`Found user ${user.id} (${user.email})`);
  console.log(`Current growth status: ${gp.planStatus}, cycle: ${gp.currentCycle}, cycleId: ${gp.cycleId}`);

  if (gp.planStatus !== "active") {
    console.log("Plan is not active — nothing to inactivate.");
    process.exit(0);
  }

  const now = Timestamp.now();
  const nextState = {
    ...gp,
    planStatus: "expired" as const,
    canReEnter: true,
    isEligibleWithdrawal: false,
    planEndDate: now,
  };

  const db = admin.firestore();
  const batch = db.batch();
  const userRef = db.collection("users").doc(user.id);
  batch.update(userRef, {
    growthPlan: nextState,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (gp.cycleId) {
    const cycleRef = db.collection("growthCycles").doc(gp.cycleId);
    batch.update(cycleRef, {
      planStatus: "expired",
      planEndDate: now,
      updatedAt: now,
      completedAt: now,
    });
  }

  const incomeRef = db.collection("incomeHistory").doc();
  batch.set(incomeRef, {
    userId: user.id,
    investmentId: GROWTH_INCOME_CYCLE_ID,
    amount: 0,
    type: "INVESTMENT",
    planAmount: gp.planAmount,
    dayNumber: 0,
    note: `Smart Growth Plan admin inactivation · Cycle ${gp.currentCycle}`,
    date: now,
  });

  await batch.commit();
  console.log(`Inactivated Smart Growth Plan for ${email} (status → expired, can re-enter).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
