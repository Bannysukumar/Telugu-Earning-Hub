import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SERVICE_ACCOUNT_FILE = "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json";
const GROWTH_SETTINGS_DOC_ID = "global";

const GROWTH_PLAN_DEFAULTS = {
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

function init() {
  const saPath = join(process.cwd(), SERVICE_ACCOUNT_FILE);
  if (!existsSync(saPath)) throw new Error(`Missing ${SERVICE_ACCOUNT_FILE}`);
  const raw = JSON.parse(readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: raw.project_id,
        clientEmail: raw.client_email,
        privateKey: raw.private_key,
      }),
    });
  }
}

async function main() {
  init();
  const db = admin.firestore();
  await db
    .collection("growthPlanSettings")
    .doc(GROWTH_SETTINGS_DOC_ID)
    .set({ ...GROWTH_PLAN_DEFAULTS, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log("Seeded growthPlanSettings/global:", GROWTH_PLAN_DEFAULTS.planName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
