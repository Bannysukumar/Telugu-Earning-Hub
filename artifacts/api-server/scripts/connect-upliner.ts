/**
 * Set a member's direct sponsor (upline) by email.
 *
 *   set FIREBASE_SERVICE_ACCOUNT_PATH=..\..\telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/connect-upliner.ts -- --member a@x.com --sponsor b@y.com
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/connect-upliner.ts -- --member a@x.com --sponsor b@y.com --side right
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/connect-upliner.ts -- --dry-run ...
 */
import { FieldValue } from "firebase-admin/firestore";
import { findUserByEmail, getUser, type UserDoc } from "../src/lib/firestore-db.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const memberEmail = arg("member");
  const sponsorEmail = arg("sponsor");
  const sideRaw = arg("side")?.toLowerCase();
  const side: "left" | "right" = sideRaw === "right" ? "right" : "left";

  if (!memberEmail || !sponsorEmail) {
    console.error(
      "Usage: tsx ./scripts/connect-upliner.ts -- --member <email> --sponsor <email> [--side left|right] [--dry-run]",
    );
    process.exit(1);
  }

  const member = await findUserByEmail(memberEmail);
  if (!member) {
    console.error(`Member not found: ${memberEmail}`);
    process.exit(1);
  }

  const sponsor = await findUserByEmail(sponsorEmail);
  if (!sponsor) {
    console.error(`Sponsor not found: ${sponsorEmail}`);
    process.exit(1);
  }

  if (member.id === sponsor.id) {
    console.error("Member and sponsor cannot be the same user.");
    process.exit(1);
  }

  let cursor: (UserDoc & { id: string }) | null = sponsor;
  const guard = new Set<string>();
  while (cursor?.referrerId && guard.size < 64) {
    if (cursor.referrerId === member.id) {
      console.error("Cannot connect: sponsor is in member's downline (cycle).");
      process.exit(1);
    }
    guard.add(cursor.id);
    cursor = await getUser(cursor.referrerId);
  }

  console.log("Member:", member.name, member.email, `(${member.id})`);
  console.log("  current referrerId:", member.referrerId ?? "(none)");
  console.log("  current binaryParentId:", member.binaryParentId ?? "(none)");
  console.log("  current binarySide:", member.binarySide ?? "(none)");
  console.log("Sponsor:", sponsor.name, sponsor.email, `(${sponsor.id})`);
  console.log(`\n${dryRun ? "[dry-run] " : ""}Will set:`);
  console.log(`  referrerId → ${sponsor.id}`);
  console.log(`  binaryParentId → ${sponsor.id}`);
  console.log(`  binarySide → ${side}`);

  if (!dryRun) {
    const { getFirestore } = await import("firebase-admin/firestore");
    const { admin } = await import("../src/lib/firebase-admin.js");
    const db = getFirestore(admin.app());
    await db.collection("users").doc(member.id).update({
      referrerId: sponsor.id,
      binaryParentId: sponsor.id,
      binarySide: side,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log("\nUpdated successfully.");
  } else {
    console.log("\nNo changes written (dry-run).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
