/**
 * Permanently delete members by email (Firebase Auth + Firestore profile + related rows).
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-users-by-email.ts -- \
 *     --confirm --email=singarapupraveen100@gmail.com --email=maharajinternet@gmail.com
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-users-by-email.ts -- --dry-run --email=...
 */
import type { UserDoc } from "../src/lib/firestore-db.js";
import { findUserByEmail } from "../src/lib/firestore-db.js";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";

const PROTECTED_EMAILS = new Set(["bannysukumar@gmail.com"]);

function emailsFromArgs(): string[] {
  const out: string[] = [];
  for (const a of process.argv) {
    if (a.startsWith("--email=")) {
      const e = a.slice("--email=".length).trim().toLowerCase();
      if (e) out.push(e);
    }
  }
  return [...new Set(out)];
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

async function deleteAuthByUid(uid: string, dryRun: boolean): Promise<boolean> {
  try {
    if (!dryRun) await admin.auth().deleteUser(uid);
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
  const confirm = process.argv.includes("--confirm");
  const emails = emailsFromArgs();

  if (emails.length === 0) {
    console.error("Provide at least one --email=user@example.com");
    process.exit(1);
  }
  if (!dryRun && !confirm) {
    console.error("Add --confirm to permanently delete, or use --dry-run to preview.");
    process.exit(1);
  }

  const blocked = emails.filter((e) => PROTECTED_EMAILS.has(e));
  if (blocked.length > 0) {
    console.error(`Refusing to delete protected account(s): ${blocked.join(", ")}`);
    process.exit(1);
  }

  const db = getFirestore(admin.app());
  console.log(
    dryRun
      ? `[dry-run] Would delete ${emails.length} user(s) by email`
      : `Deleting ${emails.length} user(s) permanently…`,
  );

  let authDeleted = 0;
  let firestoreUsersDeleted = 0;
  let investmentsDeleted = 0;
  let incomeDeleted = 0;
  let withdrawalsDeleted = 0;
  let depositsDeleted = 0;
  let notFound = 0;

  for (const email of emails) {
    const profile = await findUserByEmail(email);
    if (!profile) {
      console.log(`  ✗ ${email} — not found in Firestore/Auth`);
      notFound++;
      continue;
    }

    const uid = profile.id;
    console.log(`  → ${profile.name} <${email}> (${uid})`);

    const invN = await deleteQueryDocs(db, "investments", "userId", uid, dryRun);
    const incN = await deleteQueryDocs(db, "incomeHistory", "userId", uid, dryRun);
    const wN = await deleteQueryDocs(db, "withdrawals", "userId", uid, dryRun);
    const dN = await deleteQueryDocs(db, "deposits", "userId", uid, dryRun);
    investmentsDeleted += invN;
    incomeDeleted += incN;
    withdrawalsDeleted += wN;
    depositsDeleted += dN;

    if (!dryRun) {
      await db.collection("users").doc(uid).delete();
    }
    firestoreUsersDeleted++;

    const hadAuth = await deleteAuthByUid(uid, dryRun);
    if (hadAuth) authDeleted++;

    console.log(
      `    removed: investments=${invN}, income=${incN}, withdrawals=${wN}, deposits=${dN}, auth=${hadAuth ? "yes" : "no"}`,
    );
  }

  console.log("\n--- Summary ---");
  console.log(`Requested: ${emails.length}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Users (Firestore): ${firestoreUsersDeleted}`);
  console.log(`Users (Auth): ${authDeleted}`);
  console.log(`Investments: ${investmentsDeleted}`);
  console.log(`Income history: ${incomeDeleted}`);
  console.log(`Withdrawals: ${withdrawalsDeleted}`);
  console.log(`Deposits: ${depositsDeleted}`);
  if (dryRun) console.log("\nRe-run with --confirm (no --dry-run) to apply.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
