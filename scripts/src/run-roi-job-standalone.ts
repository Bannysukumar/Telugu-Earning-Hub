import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_ACCOUNT_FILE = "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function resolveServiceAccountPath(): string {
  const explicit =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidates = [
    explicit,
    join(repoRoot, SERVICE_ACCOUNT_FILE),
    join(process.cwd(), SERVICE_ACCOUNT_FILE),
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(`Service account JSON not found (${SERVICE_ACCOUNT_FILE}).`);
}

function initFirebase(): admin.firestore.Firestore {
  const saPath = resolveServiceAccountPath();
  const raw = JSON.parse(readFileSync(saPath, "utf8")) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  const projectId = raw.project_id ?? "telugu-earning-hub-2f74e";
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: raw.client_email!,
        privateKey: raw.private_key!,
      }),
      projectId,
    });
  }
  return admin.firestore();
}

function isIstWeekend(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

type Investment = {
  id: string;
  userId: string;
  amount: number;
  dailyRoi: number;
  maxReturn: number;
  totalEarned: number;
  daysCompleted: number;
  maxDays: number;
  systemActive: boolean;
  manualStatus: string;
  isActive: boolean;
};

function mapInv(id: string, data: FirebaseFirestore.DocumentData): Investment {
  return {
    id,
    userId: String(data.userId),
    amount: Number(data.amount),
    dailyRoi: Number(data.dailyRoi),
    maxReturn: Number(data.maxReturn),
    totalEarned: Number(data.totalEarned ?? 0),
    daysCompleted: Number(data.daysCompleted ?? 0),
    maxDays: Number(data.maxDays),
    systemActive: Boolean(data.systemActive ?? true),
    manualStatus: String(data.manualStatus ?? "active"),
    isActive: Boolean(data.isActive),
  };
}

async function main(): Promise<void> {
  const db = initFirebase();
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(now);

  console.log(`Firebase project: telugu-earning-hub-2f74e`);
  console.log(`IST weekday: ${weekday}`);

  const plansSnap = await db.collection("plans").get();
  console.log(`\nPlans: ${plansSnap.size}`);
  for (const doc of plansSnap.docs) {
    const p = doc.data();
    console.log(`  - ${p.name}: ₹${p.amount}, ${p.maxDays}d, daily ₹${p.dailyRoi}, active=${p.isActive}`);
  }

  const invSnap = await db.collection("investments").where("isActive", "==", true).get();
  console.log(`\nActive investments: ${invSnap.size}`);
  for (const doc of invSnap.docs) {
    const inv = mapInv(doc.id, doc.data());
    console.log(
      `  - ${inv.id}: user=${inv.userId}, earned=${inv.totalEarned}/${inv.maxReturn}, day ${inv.daysCompleted}/${inv.maxDays}, roi=${inv.dailyRoi}`,
    );
  }

  if (isIstWeekend(now)) {
    console.log("\nROI skipped — today is weekend in Asia/Kolkata.");
    return;
  }

  if (invSnap.empty) {
    console.log("\nNo active investments to credit.");
    return;
  }

  console.log("\nRunning ROI job...");
  let processed = 0;
  let deactivated = 0;
  const ts = admin.firestore.Timestamp.now();

  for (const doc of invSnap.docs) {
    const inv = mapInv(doc.id, doc.data());
    if (!inv.isActive || inv.manualStatus === "inactive" || !inv.systemActive) continue;

    if (inv.totalEarned >= inv.maxReturn || inv.daysCompleted >= inv.maxDays) {
      await db.collection("investments").doc(inv.id).update({
        systemActive: false,
        isActive: false,
        lastRoiUpdate: ts,
      });
      deactivated++;
      continue;
    }

    const remaining = inv.maxReturn - inv.totalEarned;
    const payout = Math.min(inv.dailyRoi, Math.max(0, remaining));
    if (payout <= 0) {
      await db.collection("investments").doc(inv.id).update({
        systemActive: false,
        isActive: false,
        lastRoiUpdate: ts,
      });
      deactivated++;
      continue;
    }

    const newTotalEarned = inv.totalEarned + payout;
    const newDaysCompleted = inv.daysCompleted + 1;
    const systemDone = newTotalEarned >= inv.maxReturn || newDaysCompleted >= inv.maxDays;

    await db.collection("investments").doc(inv.id).update({
      totalEarned: newTotalEarned,
      daysCompleted: newDaysCompleted,
      systemActive: !systemDone,
      isActive: !systemDone && inv.manualStatus === "active",
      lastRoiUpdate: ts,
    });

    const userRef = db.collection("users").doc(inv.userId);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) return;
      const balance = Number(userSnap.data()?.walletBalance ?? 0);
      tx.update(userRef, { walletBalance: balance + payout });
    });

    await db.collection("incomeHistory").add({
      userId: inv.userId,
      investmentId: inv.id,
      amount: payout,
      type: "ROI",
      planAmount: inv.amount,
      dayNumber: newDaysCompleted,
      date: ts,
    });

    if (systemDone) deactivated++;
    processed++;
    console.log(`  Credited ₹${payout} to user ${inv.userId} (investment ${inv.id})`);
  }

  console.log(`\nDone: processed=${processed}, deactivated=${deactivated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
