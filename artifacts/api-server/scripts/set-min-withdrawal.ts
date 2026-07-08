/**
 * Set site-wide minimum withdrawal amount (Firestore settings/global).
 *
 *   pnpm --filter @workspace/api-server run settings:min-withdrawal -- --amount=5000
 */
import { getMinWithdrawalAmount, setMinWithdrawalAmount } from "../src/lib/firestore-db.js";
import "../src/lib/firebase-admin.js";

function amountFromArgs(): number {
  for (const a of process.argv) {
    if (a.startsWith("--amount=")) {
      const n = Number(a.slice("--amount=".length).replace(/,/g, ""));
      if (Number.isFinite(n)) return Math.round(n);
    }
  }
  return 5000;
}

async function main() {
  const amount = amountFromArgs();
  if (amount < 1) {
    console.error("Amount must be at least ₹1.");
    process.exit(1);
  }
  await setMinWithdrawalAmount(amount);
  const current = await getMinWithdrawalAmount();
  console.log(`Minimum withdrawal is now ₹${current.toLocaleString("en-IN")}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
