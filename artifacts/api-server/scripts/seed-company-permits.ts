/**
 * Bulk-create Firebase Auth users + Firestore profiles under one sponsor referral code.
 * Binary placement uses BFS spill (same rules as {@link findBinaryPlacementForNewMember})
 * with a Firestore child cache so large batches stay fast.
 *
 * Usage (service account discoverable per firebase-admin.ts, or set FIREBASE_SERVICE_ACCOUNT_PATH):
 *
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/seed-company-permits.ts -- --referral=CODE --count=128
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/seed-company-permits.ts -- --referral=CODE --count=128 --dry-run
 *   pnpm --filter @workspace/api-server exec tsx ./scripts/seed-company-permits.ts -- --referral=CODE --batch=mp6hzbam --from=81 --count=128
 */
import { admin } from "../src/lib/firebase-admin.js";
import { createUserProfile } from "../src/lib/firestore-db.js";
import {
  findReferrerByCode,
  generateUniqueReferralCode,
  listUsersWithBinaryParent,
} from "../src/lib/investment-mlm.js";

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a?.slice(prefix.length);
}

const kidsCache = new Map<string, Awaited<ReturnType<typeof listUsersWithBinaryParent>>>();

async function findNextBinarySlot(sponsorId: string): Promise<{ parentId: string; side: "left" | "right" }> {
  const queue: string[] = [sponsorId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    let kids = kidsCache.get(id);
    if (!kids) {
      kids = await listUsersWithBinaryParent(id);
      kidsCache.set(id, kids);
    }
    const left = kids.find((k) => k.binarySide === "left");
    const right = kids.find((k) => k.binarySide === "right");
    if (!left) return { parentId: id, side: "left" };
    if (!right) return { parentId: id, side: "right" };
    queue.push(left.id, right.id);
  }
  return { parentId: sponsorId, side: "left" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const referral = (argValue("--referral=") ?? "").trim().toUpperCase();
  const count = Math.max(1, Math.min(500, Number(argValue("--count=") ?? "128") || 128));
  const startFrom = Math.max(1, Math.min(500, Number(argValue("--from=") ?? "1") || 1));
  const password =
    (argValue("--password=") ?? "").trim() || "CoBatch_ChangeMe128!";
  const batchArg = (argValue("--batch=") ?? "").trim();

  if (!referral) {
    console.error("Missing --referral=YOUR_SPONSOR_CODE");
    process.exit(1);
  }

  const sponsor = await findReferrerByCode(referral);
  if (!sponsor) {
    console.error(`No user found with referralCode=${referral}`);
    process.exit(1);
  }

  const batch = batchArg || `${Date.now().toString(36)}`;
  const created: { index: number; uid: string; email: string; referralCode: string }[] = [];

  console.log(
    dryRun
      ? `[dry-run] Would create users ${startFrom}..${count} (batch=${batch}) under sponsor ${sponsor.id} (code ${referral})`
      : `Creating users ${startFrom}..${count} (batch=${batch}) under sponsor ${sponsor.id} (code ${referral})`,
  );

  for (let i = startFrom; i <= count; i++) {
    const email = `company-permit.${batch}.${String(i).padStart(3, "0")}@example.com`;
    const name = `Company Permit ${i}`;
    const phone = "9999999999";

    if (dryRun) {
      created.push({ index: i, uid: "(dry-run)", email, referralCode: "(dry-run)" });
      continue;
    }

    const placement = await findNextBinarySlot(sponsor.id);
    const myReferralCode = await generateUniqueReferralCode();

    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        emailVerified: false,
      });
    } catch (e: unknown) {
      const code =
        typeof e === "object" && e !== null && "code" in e
          ? String((e as { code?: string }).code)
          : typeof e === "object" && e !== null && "errorInfo" in e
            ? String((e as { errorInfo?: { code?: string } }).errorInfo?.code ?? "")
            : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "auth/email-already-exists" || msg.includes("already in use")) {
        console.log(`Skip ${i}: Auth email already exists (${email})`);
        continue;
      }
      throw e;
    }

    await createUserProfile(userRecord.uid, {
      name,
      email,
      phone,
      role: "company",
      walletBalance: 0,
      isActive: true,
      referralCode: myReferralCode,
      referrerId: sponsor.id,
      binaryParentId: placement.parentId,
      binarySide: placement.side,
    });

    kidsCache.delete(placement.parentId);

    created.push({
      index: i,
      uid: userRecord.uid,
      email,
      referralCode: myReferralCode,
    });
    if (i % 16 === 0 || i === count) {
      console.log(`… ${i}/${count} done`);
    }
  }

  const eighth = created.find((r) => r.index === 8);
  const last = created.find((r) => r.index === count);
  console.log("\n--- Summary (this run only) ---");
  console.log(`8th user email: ${eighth?.email ?? "(not created in this run — use report script)"}`);
  console.log(`8th user referralCode: ${eighth?.referralCode ?? "—"}`);
  console.log(`${count}th user email: ${last?.email ?? "(not created in this run — use report script)"}`);
  console.log(`${count}th user referralCode: ${last?.referralCode ?? "—"}`);
  if (!dryRun) {
    console.log(`\nShared password (change in Firebase Auth if needed): ${password}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
