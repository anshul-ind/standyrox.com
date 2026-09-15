import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { env } from "@/lib/env";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // 1. Parse multipart body.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("Logo upload: invalid multipart body:", err);
    return errorResponse(
      "Expected multipart/form-data with a 'file' field.",
      400
    );
  }

  // 2. Validate file
  const raw = formData.get("file");
  if (!(raw instanceof File)) {
    return errorResponse(
      "No file provided. Send a 'file' field using multipart/form-data.",
      400
    );
  }
  const file = raw as File;

  if (!file.name) {
    return errorResponse("The uploaded file is missing a filename.", 400);
  }

  if (file.size === 0) {
    return errorResponse("The uploaded file is empty.", 400);
  }

  // 3. Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return errorResponse(
      `Invalid file type: "${file.type}". Allowed: ${ALLOWED_TYPES.join(", ")}`,
      400
    );
  }

  // 4. Validate size
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 2MB`,
      400
    );
  }

  // 5. Unique filename under the logos/ prefix
  const ext = (file.name.split(".").pop() ?? "png")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeExt = ext.length > 0 && ext.length <= 5 ? ext : "png";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const filename = `logos/${uniqueName}`;

  // 6. Check Vercel Blob credentials
  const readWriteToken = env.BLOB_READ_WRITE_TOKEN;
  const isVercelBlobToken =
    readWriteToken && readWriteToken.startsWith("vercel_blob_rw_");

  if (isVercelBlobToken) {
    try {
      const blob = await put(filename, file, {
        access: "public",
        token: readWriteToken,
        addRandomSuffix: false,
      });
      return NextResponse.json({ url: blob.url, pathname: blob.pathname });
    } catch (err) {
      console.error("Vercel Blob upload failed:", err);
      // In production, return error if blob fails
      if (process.env.NODE_ENV === "production") {
        return errorResponse("Uploading to storage failed. Please try again.", 500);
      }
      console.warn("Falling back to local disk storage in development...");
    }
  }

  // 7. Local disk storage fallback (for development/local without live blob credentials)
  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = path.join(process.cwd(), "public", "uploads", "logos");
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const localFilePath = path.join(uploadDir, uniqueName);
    await fs.promises.writeFile(localFilePath, buffer);

    const relativeUrl = `/uploads/logos/${uniqueName}`;
    return NextResponse.json({ url: relativeUrl, pathname: relativeUrl });
  } catch (err) {
    console.error("Local disk upload failed:", err);
    return errorResponse("Failed to save uploaded file. Please try again.", 500);
  }
}

