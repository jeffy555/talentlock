import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import usersRouter from "./users";
import freelancersRouter from "./freelancers";
import employersRouter from "./employers";
import jobRequirementsRouter from "./jobRequirements";
import bookingsRouter from "./bookings";
import agreementsRouter from "./agreements";
import openaiChatRouter from "./openaiChat";
import dashboardRouter from "./dashboard";
import verifyDocumentsRouter from "./verifyDocuments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(freelancersRouter);
router.use(employersRouter);
router.use(jobRequirementsRouter);
router.use(bookingsRouter);
router.use(agreementsRouter);
router.use(openaiChatRouter);
router.use(dashboardRouter);
router.use(verifyDocumentsRouter);

export default router;
