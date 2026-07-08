/**
 * Delete all company-permit.* users (Firebase Auth + Firestore + related rows).
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-company-permits.ts -- --referral=4N7BVD42 --dry-run
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-company-permits.ts -- --referral=4N7BVD42
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-company-permits.ts -- --referral=4N7BVD42 --batch=mp6hzlcz
 */
import type { UserDoc } from "../src/lib/firestore-db.js";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import { findReferrerByCode } from "../src/lib/investment-mlm.js";

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a?.slice(prefix.length);
}

function parsePermitEmail(email: string): { batch: string; n: number } | null {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(".");
  if (parts.length !== 3 || parts[0] !== "company-permit") return null;
  const batch = parts[1]!;
  const n = Number(parts[2]);
  if (!Number.isFinite(n)) return null;
  return { batch, n };
}

async function deleteQueryDocs(
  db: Firestore,
  collection: string,
  field: string,
  uid: string,
  dryRun: boolean,
): Promise<number> {
  const snap = await db.collection(collection).where(field, "==", uid).get();
  if (dryRun) return snap.size;
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  if (snap.docs.length > 0) await batch.commit();
  return snap.size;
}

async function deleteAuthByEmail(email: string, dryRun: boolean): Promise<boolean> {
  try {
    const authUser = await admin.auth().getUserByEmail(email);
    if (!dryRun) await admin.auth().deleteUser(authUser.uid);
    return true;
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "auth/user-not-found") return false;
    throw e;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const referral = (argValue("--referral=") ?? "4N7BVD42").trim().toUpperCase();
  const batchFilter = (argValue("--batch=") ?? "").trim();

  const sponsor = await findReferrerByCode(referral);
  if (!sponsor) {
    console.error(`No user with referralCode=${referral}`);
    process.exit(1);
  }

  const db = getFirestore(admin.app());
  const snap = await db.collection("users").where("referrerId", "==", sponsor.id).get();

  const targets: { uid: string; email: string; batch: string; n: number }[] = [];
  for (const d of snap.docs) {
    const u = d.data() as UserDoc;
    const email = String(u.email ?? "").toLowerCase();
    const parsed = parsePermitEmail(email);
    if (!parsed) continue;
    if (batchFilter && parsed.batch !== batchFilter) continue;
    targets.push({ uid: d.id, email, batch: parsed.batch, n: parsed.n });
  }

  targets.sort((a, b) => a.n - b.n);

  console.log(
    dryRun
      ? `[dry-run] Would delete ${targets.length} company-permit user(s) under sponsor ${referral}`
      : `Deleting ${targets.length} company-permit user(s) under sponsor ${referral}`,
  );
  if (batchFilter) console.log(`Batch filter: ${batchFilter}`);
  if (targets.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  let authDeleted = 0;
  let firestoreUsersDeleted = 0;
  let investmentsDeleted = 0;
  let incomeDeleted = 0;
  let withdrawalsDeleted = 0;
  let depositsDeleted = 0;

  for (const t of targets) {
    const invN = await deleteQueryDocs(db, "investments", "userId", t.uid, dryRun);
    const incN = await deleteQueryDocs(db, "incomeHistory", "userId", t.uid, dryRun);
    const wN = await deleteQueryDocs(db, "withdrawals", "userId", t.uid, dryRun);
    const dN = await deleteQueryDocs(db, "deposits", "userId", t.uid, dryRun);
    investmentsDeleted += invN;
    incomeDeleted += incN;
    withdrawalsDeleted += wN;
    depositsDeleted += dN;

    if (!dryRun) {
      await db.collection("users").doc(t.uid).delete();
    }
    firestoreUsersDeleted++;

    const hadAuth = await deleteAuthByEmail(t.email, dryRun);
    if (hadAuth) authDeleted++;

    if (t.n % 16 === 0 || t.n === targets.length) {
      console.log(`… ${t.n}/${targets[targets.length - 1]?.n ?? t.n} processed`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Users (Firestore): ${firestoreUsersDeleted}`);
  console.log(`Users (Auth): ${authDeleted}`);
  console.log(`Investments removed: ${investmentsDeleted}`);
  console.log(`Income history removed: ${incomeDeleted}`);
  console.log(`Withdrawals removed: ${withdrawalsDeleted}`);
  console.log(`Deposits removed: ${depositsDeleted}`);
  if (dryRun) console.log("\nRe-run without --dry-run to apply deletions.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
