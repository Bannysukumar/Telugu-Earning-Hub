import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { admin } from "../lib/firebase-admin.js";
import { identitySignUp, identitySignIn } from "../lib/identity-toolkit.js";
import { createUserProfile, getUser, type UserDoc } from "../lib/firestore-db.js";
import { emptyGrowthPlanState, getGrowthPlanSettings, migrateUserGrowthFields } from "../lib/growth-plan-db.js";
import { requireAuth, ADMIN_EMAIL, formatUserResponse, type AuthedUser } from "../lib/auth.js";
import { httpErrorFromUnknown, errorMessage } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type UserRow = UserDoc & { id: string };

/** If Firebase Auth has a user but Firestore `users/{uid}` is missing, create it (heals failed sign-ups). */
async function ensureUserProfile(uid: string, defaults: { name: string; email: string }): Promise<UserRow> {
  const existing = await getUser(uid);
  if (existing) {
    const growthUser = existing as UserRow & { growthPlan?: unknown };
    if (!growthUser.growthPlan) {
      await migrateUserGrowthFields(uid);
      const healed = await getUser(uid);
      if (healed) return healed;
    }
    return existing;
  }

  const record = await admin.auth().getUser(uid);
  const email = record.email ?? defaults.email;
  const name =
    record.displayName?.trim() || defaults.name || email.split("@")[0] || "User";
  const role = email === ADMIN_EMAIL ? "admin" : "user";

  await createUserProfile(uid, {
    name,
    email,
    phone: "",
    role,
    walletBalance: 0,
    isActive: true,
  });

  const user = await getUser(uid);
  if (!user) {
    throw new Error("Firestore profile could not be created after login.");
  }
  logger.info({ uid }, "Healed missing Firestore profile for Firebase Auth user");
  return user;
}

function normalizeRegisterPhone(input: string): string {
  return input.replace(/\D/g, "");
}

const registerSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6, "Confirm password is required"),
    phone: z.string().trim().min(1, "Mobile number is required"),
    referralCode: z.string().trim().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine((d, ctx) => {
    const digits = normalizeRegisterPhone(d.phone);
    if (digits.length < 10 || digits.length > 15) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid mobile number (10–15 digits)",
        path: ["phone"],
      });
    }
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { name, email, password, phone, referralCode } = parsed.data;
  const phoneStored = normalizeRegisterPhone(phone);
  let uid: string | null = null;
  try {
    const cred = await identitySignUp(email, password);
    uid = cred.localId;
    const role = email === ADMIN_EMAIL ? "admin" : "user";

    let referredBy: string | null = null;
    if (referralCode?.trim()) {
      const sponsor = await getUser(referralCode.trim());
      if (!sponsor || !sponsor.isActive) {
        res.status(400).json({ error: "Invalid referral code" });
        return;
      }
      if (sponsor.id === uid) {
        res.status(400).json({ error: "You cannot refer yourself" });
        return;
      }
      referredBy = sponsor.id;
    }

    const growthSettings = await getGrowthPlanSettings();
    await createUserProfile(uid, {
      name,
      email,
      phone: phoneStored,
      role,
      walletBalance: 0,
      isActive: true,
      referredBy,
      directBonusPaid: false,
      growthPlan: emptyGrowthPlanState(growthSettings) as unknown as Record<string, unknown>,
    });
    const user = await getUser(uid);
    if (!user) {
      throw new Error("Profile missing after create (Firestore write may have failed).");
    }
    res.status(201).json({ user: formatUserResponse(user), token: cred.idToken });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    if (msg.includes("EMAIL_EXISTS")) {
      try {
        const cred = await identitySignIn(email, password);
        const user = await ensureUserProfile(cred.localId, { name, email });
        if (!user.isActive) {
          res.status(401).json({ error: "Account deactivated. Please contact support." });
          return;
        }
        res.status(200).json({
          user: formatUserResponse(user),
          token: cred.idToken,
          message: "Account already existed; signed you in and synced your profile.",
        });
        return;
      } catch (recoverErr: unknown) {
        const rm = errorMessage(recoverErr);
        if (
          rm.includes("INVALID_PASSWORD") ||
          rm.includes("EMAIL_NOT_FOUND") ||
          rm.includes("INVALID_LOGIN_CREDENTIALS") ||
          rm.includes("USER_DISABLED")
        ) {
          res.status(401).json({ error: "Invalid email or password" });
          return;
        }
        const recovered = httpErrorFromUnknown(recoverErr);
        if (recovered.status === 503 || recovered.status === 400) {
          res.status(recovered.status).json({ error: recovered.error });
          return;
        }
        res.status(409).json({
          error:
            "This email is already registered. Sign in with your password, or reset it in Firebase Authentication if needed.",
        });
        return;
      }
    }

    logger.error({ err: e }, "POST /auth/register failed");
    if (uid) {
      try {
        await admin.auth().deleteUser(uid);
      } catch {
        /* ignore */
      }
    }
    const { status, error } = httpErrorFromUnknown(e);
    res.status(status).json({ error });
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email, password } = parsed.data;
  try {
    const cred = await identitySignIn(email, password);
    const user = await ensureUserProfile(cred.localId, {
      name: email.split("@")[0] || "User",
      email,
    });
    if (!user.isActive) {
      res.status(401).json({ error: "Account deactivated. Please contact support." });
      return;
    }
    res.json({ user: formatUserResponse(user), token: cred.idToken });
  } catch (e: unknown) {
    logger.warn({ err: e }, "POST /auth/login failed");
    const m = errorMessage(e);
    if (
      m.includes("INVALID_PASSWORD") ||
      m.includes("EMAIL_NOT_FOUND") ||
      m.includes("INVALID_LOGIN_CREDENTIALS") ||
      m.includes("USER_DISABLED")
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const { status, error } = httpErrorFromUnknown(e);
    res.status(status).json({ error });
  }
});

router.post("/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  res.json(formatUserResponse(user));
});

export default router;
