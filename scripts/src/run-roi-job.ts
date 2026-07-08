import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_ACCOUNT_FILE = "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json";

function resolveServiceAccountPath(): string {
  const explicit =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const candidates = [
    explicit,
    join(root, SERVICE_ACCOUNT_FILE),
    join(process.cwd(), SERVICE_ACCOUNT_FILE),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(`Service account JSON not found (${SERVICE_ACCOUNT_FILE}).`);
}

function initFirebase(): void {
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
  console.log(`Firebase project: ${projectId}`);
}

async function main(): Promise<void> {
  initFirebase();

  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/api-server");
  process.chdir(apiRoot);

  const { runDailyRoiJob } = await import("../../artifacts/api-server/src/lib/roi-job.js");
  const { listActiveInvestments, listAllPlansOrdered } = await import(
    "../../artifacts/api-server/src/lib/firestore-db.js"
  );

  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(now);
  console.log(`IST weekday: ${weekday}`);

  const plans = await listAllPlansOrdered();
  console.log(`\nPlans in Firestore: ${plans.length}`);
  for (const p of plans) {
    console.log(`  - ${p.name}: active=${p.isActive}, amount=${p.amount}`);
  }

  const active = await listActiveInvestments();
  console.log(`\nActive investments: ${active.length}`);
  for (const inv of active) {
    console.log(
      `  - ${inv.id}: user=${inv.userId}, earned=${inv.totalEarned}/${inv.maxReturn}, days=${inv.daysCompleted}/${inv.maxDays}, dailyRoi=${inv.dailyRoi}`,
    );
  }

  if (active.length === 0) {
    console.log("\nNo active investments — ROI job will run but credit 0 users.");
  }

  console.log("\nRunning daily ROI job...");
  const result = await runDailyRoiJob(now);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  const after = await listActiveInvestments();
  console.log(`\nActive investments after job: ${after.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
