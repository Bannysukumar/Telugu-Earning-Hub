/** Quick inspect user growth + invested totals. Usage: tsx ./scripts/inspect-user-growth.ts <email> */
import { admin } from "../src/lib/firebase-admin.js";
import { findUserByEmail } from "../src/lib/firestore-db.js";
import {
  getGrowthPlanSettings,
  growthUserInvestmentTotals,
  normalizeGrowthPlanState,
  GROWTH_INCOME_CYCLE_ID,
  type GrowthUserDoc,
} from "../src/lib/growth-plan-db.js";

const email = process.argv.slice(2).filter((a) => a && a !== "--").at(-1)?.toLowerCase();
if (!email) {
  console.error("Usage: tsx ./scripts/inspect-user-growth.ts <email>");
  process.exit(1);
}

const user = await findUserByEmail(email);
if (!user) {
  console.error("User not found");
  process.exit(1);
}

const settings = await getGrowthPlanSettings();
const db = admin.firestore();
const gp = normalizeGrowthPlanState((user as GrowthUserDoc).growthPlan, settings);
const cycles = (
  await db.collection("growthCycles").where("userId", "==", user.id).get()
).docs.map((d) => ({ id: d.id, ...d.data() }));
const income = (
  await db.collection("incomeHistory").where("userId", "==", user.id).where("investmentId", "==", GROWTH_INCOME_CYCLE_ID).get()
).docs.map((d) => ({ id: d.id, note: d.data().note, amount: d.data().amount }));
const mlm = (
  await db.collection("investments").where("userId", "==", user.id).get()
).docs.map((d) => ({ id: d.id, amount: d.data().amount, isActive: d.data().isActive }));

const totals = growthUserInvestmentTotals(user as GrowthUserDoc, cycles as never);

console.log(JSON.stringify({ email: user.email, role: user.role, wallet: user.walletBalance, growthPlan: gp, cycles, growthIncome: income, mlmInvestments: mlm, growthTotals: totals }, null, 2));
