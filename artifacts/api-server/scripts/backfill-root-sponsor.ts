/**
 * One-off admin: ensure a sponsor user has a Firestore referralCode, then set referrerId
 * on every other user who has no sponsor (referrerId null / missing).
 *
 * Usage (from repo root or artifacts/api-server; service account JSON must be discoverable
 * by firebase-admin.ts — e.g. monorepo root file or FIREBASE_SERVICE_ACCOUNT_PATH):
 *
 *   pnpm --filter @workspace/api-server sponsor:backfill -- --dry-run
 *   pnpm --filter @workspace/api-server sponsor:backfill
 *   pnpm --filter @workspace/api-server sponsor:backfill -- --email=other@example.com
 *
 * Binary tree fields are not modified.
 */
import { admin } from "../src/lib/firebase-admin.js";
import { generateUniqueReferralCode } from "../src/lib/investment-mlm.js";
import { getUser, listUsersOrdered, updateUser } from "../src/lib/firestore-db.js";

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a?.slice(prefix.length);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sponsorEmail = (argValue("--email=") ?? "bannysukumar@gmail.com").trim().toLowerCase();

  const authUser = await admin.auth().getUserByEmail(sponsorEmail);
  const sponsorId = authUser.uid;
  let sponsorRow = await getUser(sponsorId);

  if (!sponsorRow) {
    console.error(`No Firestore users/${sponsorId} for ${sponsorEmail}. Create the profile (register) first.`);
    process.exit(1);
  }

  let referralCode = sponsorRow.referralCode?.trim().toUpperCase() ?? "";
  if (!referralCode) {
    referralCode = (await generateUniqueReferralCode()).toUpperCase();
    console.log(`${dryRun ? "[dry-run] would set" : "Setting"} referralCode=${referralCode} on sponsor ${sponsorEmail}`);
    if (!dryRun) {
      await updateUser(sponsorId, { referralCode });
      sponsorRow = (await getUser(sponsorId))!;
    }
  } else {
    console.log(`Sponsor already has referralCode=${referralCode}`);
  }

  const all = await listUsersOrdered();
  const targets = all.filter(
    (u) => u.id !== sponsorId && (u.referrerId == null || String(u.referrerId).trim() === ""),
  );

  console.log(`Users without referrerId (excluding sponsor): ${targets.length}`);
  for (const u of targets) {
    const line = `  referrerId <- ${sponsorId}  (${u.email})`;
    if (dryRun) {
      console.log(`[dry-run] ${line}`);
    } else {
      await updateUser(u.id, { referrerId: sponsorId });
      console.log(line);
    }
  }

  console.log("\nDone.");
  console.log(`Share register link with ref query, e.g. /register?ref=${encodeURIComponent(referralCode)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
