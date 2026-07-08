import { Router, type IRouter } from "express";
import { getBinaryPlanEnabled, getDirectIncomeEnabled } from "../lib/firestore-db.js";

const router: IRouter = Router();

/** Public feature flags (no auth) — drives UI for binary plan visibility. */
router.get("/features", async (_req, res) => {
  const [binaryPlanEnabled, directIncomeEnabled] = await Promise.all([
    getBinaryPlanEnabled(),
    getDirectIncomeEnabled(),
  ]);
  res.json({ binaryPlanEnabled, directIncomeEnabled });
});

export default router;
