/**
 * Delete incomeHistory rows matching a display time (dd MMM yyyy, HH:mm in Asia/Kolkata).
 *
 *   set FIREBASE_SERVICE_ACCOUNT_PATH=..\..\telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/delete-history-at-time.ts -- --when "15 May 2026, 22:08" --dry-run
 */
import { db } from "../src/lib/firestore-db.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim();
}

/** Match UI formatDate (local IST when formatted from UTC instant). */
function displayKey(d: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = get("month");
  const day = get("day").replace(/^0/, "") || get("day");
  return `${day} ${month} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const when = arg("when") ?? "15 May 2026, 22:08";
  const tz = arg("tz") ?? "Asia/Kolkata";

  const snap = await db.collection("incomeHistory").get();
  const toDelete: { id: string; userId: string; type: string; amount: number; key: string }[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const raw = data.date;
    if (!raw?.toDate) continue;
    const d = raw.toDate() as Date;
    const keyTz = displayKey(d, tz);
    if (keyTz === when) {
      toDelete.push({
        id: doc.id,
        userId: String(data.userId ?? ""),
        type: String(data.type ?? ""),
        amount: Number(data.amount ?? 0),
        key: keyTz,
      });
    }
  }

  console.log(`Target display time: "${when}" (${tz})`);
  console.log(`incomeHistory matches: ${toDelete.length}`);
  for (const r of toDelete) {
    console.log(`  ${r.id}  user=${r.userId}  ${r.type}  ₹${r.amount}`);
  }

  if (toDelete.length === 0) {
    console.log("No matching rows. Listing nearby times (last 30 rows by id scan):");
    const sample = snap.docs
      .map((doc) => {
        const raw = doc.data().date;
        if (!raw?.toDate) return null;
        const d = raw.toDate() as Date;
        return { id: doc.id, key: displayKey(d, tz), type: doc.data().type };
      })
      .filter(Boolean)
      .slice(0, 30);
    for (const s of sample) console.log(`  ${s!.key}  ${s!.type}  ${s!.id}`);
    return;
  }

  if (dryRun) {
    console.log("Dry run — no deletes.");
    return;
  }

  let walletAdjusted = 0;
  for (const r of toDelete) {
    await db.runTransaction(async (tx) => {
      const histRef = db.collection("incomeHistory").doc(r.id);
      const histSnap = await tx.get(histRef);
      if (!histSnap.exists) return;
      const userRef = db.collection("users").doc(r.userId);
      const userSnap = await tx.get(userRef);
      tx.delete(histRef);
      if (userSnap.exists && r.amount > 0) {
        const bal = Number(userSnap.data()?.walletBalance ?? 0);
        tx.update(userRef, { walletBalance: Math.max(0, Math.round((bal - r.amount) * 100) / 100) });
        walletAdjusted++;
      }
    });
  }
  console.log(`Deleted ${toDelete.length} incomeHistory row(s); adjusted ${walletAdjusted} wallet(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
