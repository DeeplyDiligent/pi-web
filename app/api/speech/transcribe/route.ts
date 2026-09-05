import { NextResponse } from "next/server";
import { transcribePcm } from "@/lib/speech-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 413 });
  }
  if (request.headers.get("content-type") !== "application/octet-stream") {
    return NextResponse.json({ error: "Expected 16 kHz, mono, 16-bit PCM audio." }, { status: 415 });
  }

  try {
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength === 0) {
      return NextResponse.json({ error: "The recording is empty." }, { status: 400 });
    }
    if (data.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Recording is too long." }, { status: 413 });
    }

    const text = await transcribePcm(data);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech transcription failed.";
    console.error("Speech transcription failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
