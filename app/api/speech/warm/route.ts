import { NextResponse } from "next/server";
import { warmSpeechModel } from "@/lib/speech-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await warmSpeechModel();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to warm the speech model.";
    console.error("Unable to warm the speech model:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
