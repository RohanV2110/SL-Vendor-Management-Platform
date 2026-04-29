import { NextRequest } from "next/server";
import { readUploadedFile } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return new Response("Missing path", { status: 400 });
  }

  try {
    const buffer = await readUploadedFile(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/octet-stream"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
