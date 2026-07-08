/**
 * List company-permit.* users under a sponsor referral code (by direct referrerId).
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/report-company-permits.ts -- --referral=CODE
 */
import type { UserDoc } from "../src/lib/firestore-db.js";
import { getFirestore } from "firebase-admin/firestore";
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

async function main() {
  const referral = (argValue("--referral=") ?? "").trim().toUpperCase();
  if (!referral) {
    console.error("Missing --referral=SPONSOR_CODE");
    process.exit(1);
  }
  const sponsor = await findReferrerByCode(referral);
  if (!sponsor) {
    console.error(`No user with referralCode=${referral}`);
    process.exit(1);
  }

  const db = getFirestore(admin.app());
  const snap = await db.collection("users").where("referrerId", "==", sponsor.id).get();
  const rows: { batch: string; n: number; referralCode: string; email: string }[] = [];
  for (const d of snap.docs) {
    const u = d.data() as UserDoc;
    const email = String(u.email ?? "");
    const parsed = parsePermitEmail(email);
    if (!parsed) continue;
    rows.push({
      ...parsed,
      referralCode: String(u.referralCode ?? "").toUpperCase(),
      email,
    });
  }

  const byBatch = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byBatch.get(r.batch) ?? [];
    list.push(r);
    byBatch.set(r.batch, list);
  }

  for (const [, list] of byBatch) {
    list.sort((a, b) => a.n - b.n);
  }

  const batches = [...byBatch.keys()].sort();
  console.log(`Sponsor ${sponsor.id} referral=${referral}`);
  console.log(`Found ${rows.length} company-permit users across ${batches.length} batch(es).\n`);

  for (const b of batches) {
    const list = byBatch.get(b)!;
    const eighth = list.find((x) => x.n === 8);
    const last128 = list.find((x) => x.n === 128);
    console.log(`Batch ${b}: count=${list.length}`);
    if (eighth) console.log(`  8th  referralCode: ${eighth.referralCode}  (${eighth.email})`);
    else console.log(`  8th: (not in batch)`);
    if (last128) console.log(`  128th referralCode: ${last128.referralCode}  (${last128.email})`);
    else console.log(`  128th: (not in batch)`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
