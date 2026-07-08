/**
 * Scale all investments' totalEarned so admin dashboard sum matches target.
 *
 *   set FIREBASE_SERVICE_ACCOUNT_PATH=..\..\telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/set-admin-total-earned.ts -- --target 33.33
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/set-admin-total-earned.ts -- --target 33.33 --dry-run
 */
import { db } from "../src/lib/firestore-db.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const target = Number(arg("target") ?? "33.33");
  if (!Number.isFinite(target) || target < 0) {
    console.error("Usage: tsx ./scripts/set-admin-total-earned.ts -- --target <amount> [--dry-run]");
    process.exit(1);
  }

  const snap = await db.collection("investments").get();
  const rows = snap.docs.map((d) => ({
    id: d.id,
    totalEarned: Number(d.data().totalEarned ?? 0),
    maxReturn: Number(d.data().maxReturn ?? 0),
  }));

  const currentSum = round2(rows.reduce((a, r) => a + r.totalEarned, 0));
  console.log(`Investments: ${rows.length}, current sum: ₹${currentSum}, target: ₹${target}`);

  if (rows.length === 0) {
    console.log("No investments found.");
    return;
  }

  if (currentSum === 0 && target > 0) {
    const first = rows[0]!;
    const next = Math.min(target, first.maxReturn || target);
    console.log(`All zero — would set ${first.id} totalEarned → ${next}`);
    if (!dryRun) await db.collection("investments").doc(first.id).update({ totalEarned: next });
    console.log(dryRun ? "Dry run only." : "Done.");
    return;
  }

  if (currentSum === target) {
    console.log("Already at target. Nothing to do.");
    return;
  }

  const factor = currentSum > 0 ? target / currentSum : 0;
  const updates: { id: string; from: number; to: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let next: number;
    if (i === rows.length - 1) {
      next = round2(target - allocated);
    } else {
      next = round2(row.totalEarned * factor);
      allocated = round2(allocated + next);
    }
    next = Math.min(next, row.maxReturn > 0 ? row.maxReturn : next);
    if (row.totalEarned !== next) updates.push({ id: row.id, from: row.totalEarned, to: next });
  }

  const newSum = round2(updates.reduce((a, u) => a + u.to, 0) + rows.filter((r) => !updates.find((u) => u.id === r.id)).reduce((a, r) => a + r.totalEarned, 0));
  console.log(`Planned updates: ${updates.length}, new sum: ₹${newSum}`);
  for (const u of updates.slice(0, 20)) {
    console.log(`  ${u.id}: ${u.from} → ${u.to}`);
  }
  if (updates.length > 20) console.log(`  … and ${updates.length - 20} more`);

  if (dryRun) {
    console.log("Dry run — no writes.");
    return;
  }

  const batch = db.batch();
  for (const u of updates) {
    batch.update(db.collection("investments").doc(u.id), { totalEarned: u.to });
  }
  await batch.commit();
  console.log("Firestore updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
