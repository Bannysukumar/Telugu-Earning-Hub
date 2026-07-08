import { Router, type IRouter } from "express";
import { listActivePlans, type PlanDoc } from "../lib/firestore-db.js";
import {
  resolvedDirectBonus,
  resolvedBinaryPairVolume,
  resolvedBinaryPairPayout,
  resolvedRoiPoolPercent,
  isStandalonePlan,
} from "../lib/investment-mlm.js";
import { httpErrorFromUnknown } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function formatPlan(plan: PlanDoc & { id: string }) {
  const d = plan as Partial<PlanDoc> & { id: string };
  return {
    id: plan.id,
    name: d.name ?? "Plan",
    amount: Number(d.amount ?? 0),
    dailyRoi: Number(d.dailyRoi ?? 0),
    maxReturn: Number(d.maxReturn ?? 0),
    maxDays: Number(d.maxDays ?? 0),
    description: d.description ?? null,
    isActive: d.isActive !== false,
    directBonus: resolvedDirectBonus(plan),
    binaryPairVolume: resolvedBinaryPairVolume(plan),
    binaryPairPayout: resolvedBinaryPairPayout(plan),
    roiPoolPercent: resolvedRoiPoolPercent(plan),
    planKind: isStandalonePlan(plan) ? "standalone" : "mlm",
  };
}

router.get("/", async (_req, res) => {
  try {
    const plans = await listActivePlans();
    res.json(plans.map(formatPlan));
  } catch (e) {
    logger.error({ err: e }, "GET /plans failed");
    const { status, error } = httpErrorFromUnknown(e);
    res.status(status).json({ error });
  }
});

export { formatPlan };
export default router;
