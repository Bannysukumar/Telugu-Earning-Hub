import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import plansRouter from "./plans.js";
import investmentsRouter from "./investments.js";
import withdrawalsRouter from "./withdrawals.js";
import userRouter from "./user.js";
import adminRouter from "./admin.js";
import cronRouter from "./cron.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/plans", plansRouter);
router.use("/investments", investmentsRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/user", userRouter);
router.use("/admin", adminRouter);
router.use("/cron", cronRouter);

export default router;
