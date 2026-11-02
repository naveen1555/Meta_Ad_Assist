import "dotenv/config";

function list(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  apiUrl: (process.env.API_URL || "http://localhost:4000").replace(/\/$/, ""),
  webUrl: (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, ""),
  corsOrigins: list(process.env.CORS_ORIGINS || process.env.WEB_URL || "http://localhost:3000"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  redisUrl: process.env.REDIS_URL || "",
  runWorker: process.env.RUN_WORKER !== "false",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  superAdmins: list(process.env.SUPER_ADMIN_EMAILS),
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    verifyToken: process.env.META_VERIFY_TOKEN || "chatnova-verify",
    graphVersion: process.env.META_GRAPH_VERSION || "v21.0",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  broadcastRatePerSecond: Number(process.env.BROADCAST_RATE_PER_SECOND || 20),
};

if (config.nodeEnv === "production" && config.jwtSecret === "dev-secret-change-me") {
  console.warn("[config] JWT_SECRET is not set - set it before going live");
}
