import type { IRouter, Request, Response } from "express";
import { findReferrerByCode } from "../lib/investment-mlm.js";
import { httpErrorFromUnknown } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Public sponsor validation (before register). Mounted on the main `/api` router as
 * `GET /auth/referral-lookup` so it is not dependent on nested `/auth` router ordering.
 */
export function mountReferralLookup(router: IRouter): void {
  router.get("/auth/referral-lookup", async (req: Request, res: Response) => {
    const raw = typeof req.query.code === "string" ? req.query.code : "";
    const code = raw.trim();
    if (code.length < 2) {
      res.status(400).json({ error: 'Query parameter "code" is required (min 2 characters).' });
      return;
    }
    if (code.length > 32) {
      res.status(400).json({ error: "Referral code is too long." });
      return;
    }
    try {
      const sponsor = await findReferrerByCode(code);
      if (!sponsor) {
        res.json({ valid: false, error: "No sponsor found for this code." });
        return;
      }
      res.json({ valid: true, sponsorName: sponsor.name });
    } catch (e: unknown) {
      logger.error({ err: e }, "GET /auth/referral-lookup failed");
      const { status, error } = httpErrorFromUnknown(e);
      res.status(status).json({ error });
    }
  });
}
