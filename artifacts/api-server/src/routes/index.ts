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
import meetingsRouter from "./meetings";
import jobInterestsRouter from "./jobInterests";
import notificationsRouter from "./notifications";
import demoRouter from "./demo";
import subscriptionsRouter from "./subscriptions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(demoRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(freelancersRouter);
router.use(employersRouter);
router.use(jobRequirementsRouter);
router.use(bookingsRouter);
router.use(agreementsRouter);
router.use(meetingsRouter);
router.use(jobInterestsRouter);
router.use(notificationsRouter);
router.use(subscriptionsRouter);
router.use(openaiChatRouter);
router.use(dashboardRouter);
router.use(verifyDocumentsRouter);

export default router;
