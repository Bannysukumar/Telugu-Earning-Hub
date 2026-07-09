/**
 * Fully reset a user's Smart Growth Plan: delete growth cycles, growth income logs, pending state.
 *
 * Usage:
 *   npx tsx ./scripts/reset-growth-plan-user.ts maradanamahendra07@gmail.com
 */
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import { findUserByEmail } from "../src/lib/firestore-db.js";
import {
  emptyGrowthPlanState,
  getGrowthPlanSettings,
  GROWTH_INCOME_CYCLE_ID,
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
    console.error("Usage: tsx ./scripts/reset-growth-plan-user.ts <email>");
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  const settings = await getGrowthPlanSettings();
  const db = admin.firestore();
  const userId = user.id;

  console.log(`Resetting Smart Growth for ${user.email} (${userId})`);

  const incomeSnap = await db
    .collection("incomeHistory")
    .where("userId", "==", userId)
    .where("investmentId", "==", GROWTH_INCOME_CYCLE_ID)
    .get();

  const cyclesSnap = await db.collection("growthCycles").where("userId", "==", userId).get();

  const batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async () => {
    if (ops === 0) return;
    await batch.commit();
    ops = 0;
  };

  for (const doc of incomeSnap.docs) {
    batch.delete(doc.ref);
    ops += 1;
    if (ops >= 400) await commitIfNeeded();
  }

  for (const doc of cyclesSnap.docs) {
    console.log(`  delete growthCycle ${doc.id} (cycle ${doc.data().cycleNumber})`);
    batch.delete(doc.ref);
    ops += 1;
    if (ops >= 400) await commitIfNeeded();
  }

  const userRef = db.collection("users").doc(userId);
  batch.update(userRef, {
    growthPlan: emptyGrowthPlanState(settings),
    directBonusPaid: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  ops += 1;

  await batch.commit();

  console.log(`Deleted ${incomeSnap.size} growth income row(s), ${cyclesSnap.size} growth cycle(s).`);
  console.log(`User growth plan reset → pending, cycle 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
