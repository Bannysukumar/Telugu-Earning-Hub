import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SERVICE_ACCOUNT_FILE = "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json";

type PlanSeed = {
  name: string;
  amount: number;
  dailyRoi: number;
  maxReturn: number;
  maxDays: number;
  description: string;
};

const PLANS: PlanSeed[] = [
  {
    name: "Plan 1",
    amount: 40_000,
    dailyRoi: 666.67,
    maxReturn: 80_000,
    maxDays: 120,
    description: "120-day plan with 2× total return. No referral levels.",
  },
  {
    name: "Plan 2",
    amount: 80_000,
    dailyRoi: 1_777.78,
    maxReturn: 160_000,
    maxDays: 90,
    description:
      "90-day plan with 2× total return. Referral levels 1–2: Level 1 — 8%, Level 2 — 2%.",
  },
  {
    name: "Plan 3",
    amount: 120_000,
    dailyRoi: 4_000,
    maxReturn: 240_000,
    maxDays: 60,
    description:
      "60-day plan with 2× total return. Referral levels 1–6: L1 — 8%, L2 — 3%, L3 — 2%, L4 — 1%, L5 — 0.5%, L6 — 0.5%.",
  },
  {
    name: "Plan 4",
    amount: 180_000,
    dailyRoi: 9_000,
    maxReturn: 360_000,
    maxDays: 40,
    description:
      "40-day plan with 2× total return. Referral levels 1–12: L1 — 10%, L2 — 5%, L3 — 3%, L4 — 2%, L5 — 1%, L6 — 1%, L7–L12 — 0.5% each.",
  },
];

function resolveServiceAccountPath(): string {
  const explicit =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidates = [
    explicit,
    join(process.cwd(), SERVICE_ACCOUNT_FILE),
    join(process.cwd(), "..", SERVICE_ACCOUNT_FILE),
  ].filter((p): p is string => Boolean(p));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    `Service account JSON not found. Set FIREBASE_SERVICE_ACCOUNT_PATH or place ${SERVICE_ACCOUNT_FILE} at the repo root.`,
  );
}

function initFirebase(): admin.firestore.Firestore {
  const saPath = resolveServiceAccountPath();
  const raw = JSON.parse(readFileSync(saPath, "utf8")) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!raw.client_email || !raw.private_key) {
    throw new Error("Service account JSON must include client_email and private_key.");
  }

  const projectId = raw.project_id ?? "telugu-earning-hub-2f74e";

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: raw.client_email,
        privateKey: raw.private_key,
      }),
      projectId,
    });
  }

  console.log(`Using Firebase project: ${projectId}`);
  console.log(`Service account: ${saPath}`);
  return admin.firestore();
}

async function main(): Promise<void> {
  const db = initFirebase();
  const plansCol = db.collection("plans");
  const existing = await plansCol.get();

  if (!existing.empty) {
    console.log(`Found ${existing.size} existing plan(s). Skipping names that already exist.`);
  }

  const existingNames = new Set(
    existing.docs.map((doc) => String((doc.data() as { name?: string }).name ?? "")),
  );

  let created = 0;
  for (const plan of PLANS) {
    if (existingNames.has(plan.name)) {
      console.log(`Skip: ${plan.name} (already exists)`);
      continue;
    }

    const ref = plansCol.doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      name: plan.name,
      amount: plan.amount,
      dailyRoi: plan.dailyRoi,
      maxReturn: plan.maxReturn,
      maxDays: plan.maxDays,
      description: plan.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    created += 1;
    console.log(`Created ${plan.name} (${ref.id})`);
  }

  const all = await plansCol.get();
  console.log(`\nDone. Created ${created} plan(s). Total plans in Firestore: ${all.size}.`);
  for (const doc of all.docs) {
    const p = doc.data() as PlanSeed & { isActive?: boolean };
    console.log(
      `  - ${p.name}: ₹${p.amount.toLocaleString("en-IN")}, ${p.maxDays} days, ₹${p.dailyRoi}/day, 2× = ₹${p.maxReturn.toLocaleString("en-IN")}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
