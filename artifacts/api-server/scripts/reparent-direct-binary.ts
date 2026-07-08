/**
 * Align binaryParentId with referrerId for all users (fixes legacy spill placements).
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/reparent-direct-binary.ts -- --dry-run
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/reparent-direct-binary.ts
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { admin } from "../src/lib/firebase-admin.js";
import type { UserDoc } from "../src/lib/firestore-db.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getFirestore(admin.app());
  const snap = await db.collection("users").get();

  let updated = 0;
  for (const doc of snap.docs) {
    const u = doc.data() as UserDoc;
    const referrerId = u.referrerId?.trim();
    if (!referrerId || referrerId === doc.id) continue;
    if (u.binaryParentId === referrerId) continue;

    console.log(
      `${dryRun ? "[dry-run] " : ""}${u.name} (${doc.id}): binaryParent ${u.binaryParentId ?? "null"} → ${referrerId}`,
    );
    if (!dryRun) {
      await doc.ref.update({
        binaryParentId: referrerId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    updated++;
  }

  console.log(`\n${dryRun ? "Would update" : "Updated"} ${updated} user(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
