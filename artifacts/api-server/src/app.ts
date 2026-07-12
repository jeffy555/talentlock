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

// When deployed behind a reverse proxy (Railway, Render, nginx, …) the real
// client IP is in X-Forwarded-For. Without trusting the proxy, `req.ip` is the
// proxy address for every request, which collapses the admin login rate limiter
// and pollutes audit logs. Enable via TRUST_PROXY (hop count or "true").
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true");
}

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

// SECURITY: `origin: true` reflects ANY requesting origin while also allowing
// credentials, which lets any website issue authenticated cross-origin requests
// against this API. Restrict to an explicit allowlist (ALLOWED_ORIGINS, comma
// separated; APP_URL is included by default). In non-production with no
// allowlist configured we permit all origins for local dev convenience.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === "production";
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Same-origin / non-browser requests have no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
      return callback(null, false);
    },
  }),
);
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
