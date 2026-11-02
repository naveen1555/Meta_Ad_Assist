import { Router } from "express";
import { config } from "../config";
import { hmacSha256, safeEqual } from "../lib/utils";
import { processMetaWebhook } from "../meta/webhook";
import { handleRazorpayWebhook, handleStripeWebhook } from "../services/billing";

export const webhooksRouter = Router();

webhooksRouter.get("/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.meta.verifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

webhooksRouter.post("/meta", (req, res) => {
  if (config.meta.appSecret) {
    const signature = req.header("x-hub-signature-256") || "";
    const expected = `sha256=${hmacSha256(config.meta.appSecret, req.rawBody ?? Buffer.from(""))}`;
    if (!safeEqual(signature, expected)) {
      res.sendStatus(401);
      return;
    }
  }
  // Meta expects a fast 200; process after responding.
  res.sendStatus(200);
  processMetaWebhook(req.body).catch((err) => console.error("[webhook] meta processing failed", err));
});

webhooksRouter.post("/razorpay", async (req, res) => {
  await handleRazorpayWebhook(req.rawBody ?? Buffer.from(""), req.header("x-razorpay-signature") || "", req.body);
  res.json({ ok: true });
});

webhooksRouter.post("/stripe", async (req, res) => {
  await handleStripeWebhook(req.rawBody ?? Buffer.from(""), req.header("stripe-signature") || "", req.body);
  res.json({ received: true });
});
