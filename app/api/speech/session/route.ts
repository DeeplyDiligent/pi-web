import { NextResponse } from "next/server";
import { createLiveSpeechSession } from "@/lib/speech-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const sessionId = await createLiveSpeechSession();
    return NextResponse.json({ sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start speech transcription.";
    console.error("Unable to start live speech transcription:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
