/**
 * Dump global settings, payment settings, and all plans from Firestore.
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/inspect-settings-plans.ts
 */
import "../src/lib/firebase-admin.js";
import { getFirestore } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import {
  listAllPlansOrdered,
  getMinWithdrawalAmount,
  getWithdrawalFeePercent,
  getPeerTransferFeePercent,
  getBinaryPlanEnabled,
  getDirectIncomeEnabled,
  getStandalonePlanCreationOnly,
  getLevelIncomeTiers,
  getDefaultLevelIncomeOnNewPlans,
  getPaymentSettings,
  GLOBAL_SETTINGS_DOC_ID,
} from "../src/lib/firestore-db.js";

const db = getFirestore(admin.app());
const settingsSnap = await db.collection("settings").doc(GLOBAL_SETTINGS_DOC_ID).get();
const settings = settingsSnap.data() ?? {};

const [minW, wFee, pFee, binary, direct, standaloneOnly, levelTiers, defaultLevelOn, plans, pay] =
  await Promise.all([
    getMinWithdrawalAmount(),
    getWithdrawalFeePercent(),
    getPeerTransferFeePercent(),
    getBinaryPlanEnabled(),
    getDirectIncomeEnabled(),
    getStandalonePlanCreationOnly(),
    getLevelIncomeTiers(),
    getDefaultLevelIncomeOnNewPlans(),
    listAllPlansOrdered(),
    getPaymentSettings(),
  ]);

console.log("=== GLOBAL SETTINGS (settings/global) ===");
console.log(
  JSON.stringify(
    {
      raw: settings,
      resolved: {
        minWithdrawalAmount: minW,
        withdrawalFeePercent: wFee,
        peerTransferFeePercent: pFee,
        binaryPlanEnabled: binary,
        directIncomeEnabled: direct,
        standalonePlanCreationOnly: standaloneOnly,
        defaultLevelIncomeOnNewPlans: defaultLevelOn,
        levelIncomeTiersCount: levelTiers.length,
      },
    },
    null,
    2,
  ),
);

console.log("\n=== PAYMENT SETTINGS ===");
console.log(
  JSON.stringify(
    {
      isPaymentEnabled: pay.isPaymentEnabled,
      depositMethod: pay.depositMethod,
      payeeName: pay.payeeName,
      upiIds: pay.upiIds,
    },
    null,
    2,
  ),
);

console.log(`\n=== PLANS (${plans.length}) ===`);
for (const p of plans) {
  console.log(
    JSON.stringify(
      {
        id: p.id,
        name: p.name,
        amount: p.amount,
        dailyRoi: p.dailyRoi,
        maxReturn: p.maxReturn,
        maxDays: p.maxDays,
        isActive: p.isActive,
        planKind: p.planKind ?? "mlm",
        directBonus: p.directBonus,
        binaryPairVolume: p.binaryPairVolume,
        binaryPairPayout: p.binaryPairPayout,
        roiPoolPercent: p.roiPoolPercent,
        levelIncomeEnabled: p.levelIncomeEnabled,
        levelIncomeTiers: p.levelIncomeTiers ?? null,
        description: p.description,
      },
      null,
      2,
    ),
  );
  console.log("---");
}
