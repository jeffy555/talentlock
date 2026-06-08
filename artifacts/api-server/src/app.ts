import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { generateCsrfToken, doubleCsrfProtection } from "./lib/csrf";

const app: Express = express();

app.use(helmet());

// Uncomment when deployed behind a reverse proxy (e.g. Railway, Render, nginx):
// app.set('trust proxy', 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// CSRF: token endpoint must be registered before protection middleware.
app.get("/api/admin/csrf-token", (req, res) => {
  if (!process.env.CSRF_SECRET) {
    res.status(500).json({ error: "CSRF not configured" });
    return;
  }
  res.json({ token: generateCsrfToken(req, res) });
});

app.use("/api/admin", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (!process.env.CSRF_SECRET) {
    res.status(500).json({ error: "CSRF not configured" });
    return;
  }
  return doubleCsrfProtection(req, res, next);
});

app.use("/api", router);

export default app;
