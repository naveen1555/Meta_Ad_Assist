import { Router } from "express";
import multer from "multer";
import { badRequest } from "../lib/errors";
import { saveBuffer } from "../lib/storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

/** Mounted behind requireAuth + requireWorkspace. */
export const mediaRouter = Router();

mediaRouter.post("/media", upload.single("file"), async (req, res) => {
  if (!req.file) throw badRequest("No file uploaded");
  const url = await saveBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
  const mime = req.file.mimetype;
  const mediaType = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "document";
  res.status(201).json({ url, mime, mediaType, name: req.file.originalname });
});
