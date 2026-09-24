import { NextResponse } from "next/server";
import { parseFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { isApiRequestAllowed } from "@/lib/request-security";
import {
  MAX_TEMP_ATTACHMENT_REQUEST_BYTES,
  saveTemporaryAttachments,
} from "@/lib/temporary-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  try {
    const formData = await parseFormDataWithinLimit(request, MAX_TEMP_ATTACHMENT_REQUEST_BYTES);
    const files = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string");
    const attachments = await saveTemporaryAttachments(files);
    return NextResponse.json({ attachments });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Attachments must total 100MB or less" }, { status: 413 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
