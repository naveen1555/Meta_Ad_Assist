import type { IncomingMessage } from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { requireAuth, requireSuperAdmin, requireWorkspace } from "./lib/auth";
import { HttpError, errorHandler } from "./lib/errors";
import { uploadDir } from "./lib/storage";
import { adminRouter } from "./routes/admin";
import { analyticsRouter } from "./routes/analytics";
import { authRouter } from "./routes/auth";
import { billingRouter } from "./routes/billing";
import { broadcastsRouter } from "./routes/broadcasts";
import { channelsRouter, metaOAuthRouter } from "./routes/channels";
import { contactsRouter } from "./routes/contacts";
import { conversationsRouter } from "./routes/conversations";
import { flowsRouter } from "./routes/flows";
import { integrationsRouter } from "./routes/integrations";
import { leadsRouter } from "./routes/leads";
import { mediaRouter } from "./routes/media";
import { publicRouter } from "./routes/public";
import { publicApiRouter } from "./routes/public-api";
import { templatesRouter } from "./routes/templates";
import { webhooksRouter } from "./routes/webhooks";
import { inviteRouter, workspaceRouter } from "./routes/workspace";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.corsOrigins.includes(origin.toLowerCase()) || config.corsOrigins.includes("*")) cb(null, true);
        else cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: "12mb",
      verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get("/", (_req, res) => {
    res.json({ name: "ChatNova API", status: "ok" });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });
  app.use("/media", express.static(uploadDir, { maxAge: "7d", index: false }));

  app.use("/webhooks", webhooksRouter);
  app.use("/v1", publicApiRouter);

  app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: "draft-7", legacyHeaders: false }), authRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/meta", metaOAuthRouter);
  app.use("/api/invites", inviteRouter);
  app.use("/api/admin", requireAuth, requireSuperAdmin, adminRouter);

  const scoped = express.Router();
  scoped.use(requireAuth, requireWorkspace);
  scoped.use(workspaceRouter);
  scoped.use(channelsRouter);
  scoped.use(contactsRouter);
  scoped.use(conversationsRouter);
  scoped.use(templatesRouter);
  scoped.use(broadcastsRouter);
  scoped.use(flowsRouter);
  scoped.use(leadsRouter);
  scoped.use(integrationsRouter);
  scoped.use(analyticsRouter);
  scoped.use(billingRouter);
  scoped.use(mediaRouter);
  app.use("/api", scoped);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}
