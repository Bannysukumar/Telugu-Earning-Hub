/**
 * Wipe Firestore, Firebase Auth users, and Storage files for a clean project reset.
 *
 * Usage (service account at repo root or FIREBASE_SERVICE_ACCOUNT_PATH):
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/reset-firebase-project.ts -- \
 *     --confirm=RESET-telugu-earning-hub-2f74e \
 *     --bootstrap-email=bannysukumar@gmail.com \
 *     --bootstrap-password='YourSecurePassword1!'
 *
 * Or set BOOTSTRAP_ADMIN_PASSWORD instead of --bootstrap-password.
 */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import { createUserProfile } from "../src/lib/firestore-db.js";
import { generateUniqueReferralCode } from "../src/lib/investment-mlm.js";
import { GLOBAL_SETTINGS_DOC_ID } from "../src/lib/firestore-db.js";

const PROJECT_ID = "telugu-earning-hub-2f74e";
const CONFIRM_TOKEN = `RESET-${PROJECT_ID}`;

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a?.slice(prefix.length);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function deleteAllAuthUsers(): Promise<number> {
  let total = 0;
  let pageToken: string | undefined;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    if (page.users.length === 0) break;
    await admin.auth().deleteUsers(page.users.map((u) => u.uid));
    total += page.users.length;
    pageToken = page.pageToken;
    process.stdout.write(`\r  Auth users deleted: ${total}`);
  } while (pageToken);
  if (total > 0) process.stdout.write("\n");
  return total;
}

async function deleteAllFirestore(): Promise<number> {
  const db = admin.firestore();
  const collections = await db.listCollections();
  let count = 0;
  for (const coll of collections) {
    process.stdout.write(`  Deleting Firestore /${coll.id}…\n`);
    await db.recursiveDelete(coll);
    count += 1;
  }
  return count;
}

async function deleteAllStorageFiles(): Promise<number> {
  const bucket = admin.storage().bucket();
  let deleted = 0;
  let pageToken: string | undefined;
  do {
    const [files, , resp] = await bucket.getFiles({ autoPaginate: false, maxResults: 500, pageToken });
    if (files.length === 0) break;
    await Promise.all(files.map((f) => f.delete().catch(() => undefined)));
    deleted += files.length;
    pageToken = resp?.pageToken;
    process.stdout.write(`\r  Storage files deleted: ${deleted}`);
  } while (pageToken);
  if (deleted > 0) process.stdout.write("\n");
  return deleted;
}

async function seedDefaults(): Promise<void> {
  const db = admin.firestore();
  const now = FieldValue.serverTimestamp();
  await db.collection("settings").doc(GLOBAL_SETTINGS_DOC_ID).set({
    withdrawalFeePercent: 10,
    peerTransferFeePercent: 0,
    binaryPlanEnabled: false,
    directIncomeEnabled: true,
    standalonePlanCreationOnly: false,
    defaultLevelIncomeOnNewPlans: false,
    levelIncomeTiers: [],
    updatedAt: now,
  });
  await db.collection("paymentSettings").doc("global").set({
    isPaymentEnabled: false,
    depositMethod: "dynamic_upi",
    upiIds: [],
    payeeName: "Telugu Earning Hub",
    updatedAt: now,
  });
}

async function bootstrapAdmin(email: string, password: string, name: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  let user;
  try {
    user = await admin.auth().createUser({
      email: normalized,
      password,
      displayName: name,
      emailVerified: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists")) throw e;
    const existing = await admin.auth().getUserByEmail(normalized);
    await admin.auth().updateUser(existing.uid, { password, displayName: name, emailVerified: true });
    user = existing;
  }

  const referralCode = await generateUniqueReferralCode();
  await createUserProfile(user.uid, {
    name,
    email: normalized,
    phone: "",
    role: "admin",
    walletBalance: 0,
    isActive: true,
    referralCode,
    referrerId: null,
    binaryParentId: null,
    binarySide: null,
  });
  console.log(`  Admin bootstrapped: ${normalized} (uid=${user.uid}, referral=${referralCode})`);
}

async function main() {
  const confirm = (argValue("--confirm=") ?? "").trim();
  if (confirm !== CONFIRM_TOKEN) {
    console.error(`Missing or wrong --confirm=. Required: --confirm=${CONFIRM_TOKEN}`);
    process.exit(1);
  }

  if (!hasFlag("--i-understand-this-deletes-everything")) {
    console.error("Add --i-understand-this-deletes-everything to proceed.");
    process.exit(1);
  }

  const bootstrapEmail = (argValue("--bootstrap-email=") ?? "bannysukumar@gmail.com").trim().toLowerCase();
  const bootstrapPassword =
    (argValue("--bootstrap-password=") ?? process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "").trim() ||
    randomBytes(12).toString("base64url");
  const generatedPassword = !(
    argValue("--bootstrap-password=") ?? process.env.BOOTSTRAP_ADMIN_PASSWORD
  )?.trim();
  const bootstrapName = (argValue("--bootstrap-name=") ?? "Platform Admin").trim();
  const skipStorage = hasFlag("--skip-storage");

  const appProject = admin.app().options.projectId;
  console.log(`\n=== Firebase reset: ${appProject ?? PROJECT_ID} ===\n`);

  console.log("1/4 Deleting Firebase Auth users…");
  const authDeleted = await deleteAllAuthUsers();
  console.log(`     Done (${authDeleted} users).\n`);

  console.log("2/4 Deleting all Firestore collections…");
  const collDeleted = await deleteAllFirestore();
  console.log(`     Done (${collDeleted} root collections).\n`);

  console.log("3/4 Clearing Storage…");
  const filesDeleted = skipStorage ? 0 : await deleteAllStorageFiles();
  console.log(`     Done (${filesDeleted} files).\n`);

  console.log("4/4 Seeding default settings + admin…");
  await seedDefaults();
  await bootstrapAdmin(bootstrapEmail, bootstrapPassword, bootstrapName);
  console.log("     Done.\n");

  console.log("=== Reset complete ===");
  console.log(`Admin login email: ${bootstrapEmail}`);
  if (generatedPassword) {
    console.log(`Generated password (save now): ${bootstrapPassword}`);
  } else {
    console.log("Admin password: (from --bootstrap-password or BOOTSTRAP_ADMIN_PASSWORD)");
  }
  console.log("\nSet on API server: ADMIN_EMAIL=bannysukumar@gmail.com");
  console.log("Redeploy Cloud Functions: pnpm run firebase:deploy-functions\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
