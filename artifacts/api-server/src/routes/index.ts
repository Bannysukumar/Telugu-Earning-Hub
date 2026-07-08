import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import plansRouter from "./plans.js";
import investmentsRouter from "./investments.js";
import withdrawalsRouter from "./withdrawals.js";
import userRouter from "./user.js";
import adminRouter from "./admin.js";
import adminGrowthPlanRouter from "./admin-growth-plan.js";
import cronRouter from "./cron.js";
import growthPlanRouter from "./growth-plan.js";
import platformRouter from "./platform.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/platform", platformRouter);
router.use("/auth", authRouter);
router.use("/plans", plansRouter);
router.use("/investments", investmentsRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/user", userRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminGrowthPlanRouter);
router.use("/growth-plan", growthPlanRouter);
router.use("/cron", cronRouter);

export default router;
