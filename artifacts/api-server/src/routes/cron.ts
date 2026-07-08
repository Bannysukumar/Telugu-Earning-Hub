import { Router, type IRouter } from "express";
import { runDailyRoiJob } from "../lib/roi-job.js";
import { runGrowthPlanDailyJob } from "../lib/growth-plan-job.js";
import { requireCronOrAdmin } from "../lib/auth.js";

const router: IRouter = Router();

router.post("/process-roi", requireCronOrAdmin, async (req, res) => {
  const result = await runDailyRoiJob(new Date());
  req.log?.info(
    { processedCount: result.processedCount, deactivatedCount: result.deactivatedCount },
    "ROI processing complete",
  );
  res.json(result);
});

router.post("/process-growth-roi", requireCronOrAdmin, async (req, res) => {
  const result = await runGrowthPlanDailyJob(new Date());
  req.log?.info(
    {
      processedCount: result.processedCount,
      expiredCount: result.expiredCount,
      completedCount: result.completedCount,
    },
    "Growth plan ROI processing complete",
  );
  res.json(result);
});

export default router;
