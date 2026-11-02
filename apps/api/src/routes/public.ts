import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";

/** Unauthenticated endpoints used by the marketing site. */
export const publicRouter = Router();

publicRouter.post(
  "/contact",
  rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false }),
  async (req, res) => {
    const input = z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email(),
        phone: z.string().max(32).optional(),
        company: z.string().max(120).optional(),
        message: z.string().min(1).max(5000),
      })
      .parse(req.body);
    await prisma.contactRequest.create({ data: { ...input, phone: input.phone || null, company: input.company || null } });
    res.status(201).json({ ok: true });
  },
);
