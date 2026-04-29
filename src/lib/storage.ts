import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@/lib/env";

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function saveUploadedFile(file: File, folder: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = `${Date.now()}-${crypto.randomUUID()}-${sanitizeSegment(file.name)}`;
  const uploadFolder = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.uploadDir, sanitizeSegment(folder));
  await mkdir(uploadFolder, { recursive: true });

  const absolutePath = path.join(uploadFolder, fileName);
  await writeFile(absolutePath, bytes);

  return {
    fileName: file.name,
    relativePath: path.relative(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.uploadDir), absolutePath)
  };
}

export async function readUploadedFile(relativePath: string) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.uploadDir, safePath);
  return readFile(absolutePath);
}
