import { NextResponse } from "next/server";
import {
  appendLiveSpeechAudio,
  cancelLiveSpeechSession,
  finishLiveSpeechSession,
  subscribeLiveSpeechSession,
} from "@/lib/speech-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHUNK_BYTES = 256 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Live transcription failed.";
  const status = message.includes("not found") || message.includes("expired") ? 404 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Audio chunk is too large." }, { status: 413 });
    }
    if (request.headers.get("content-type") !== "application/octet-stream") {
      return NextResponse.json({ error: "Expected 16 kHz mono PCM audio." }, { status: 415 });
    }
    const pcm = new Uint8Array(await request.arrayBuffer());
    if (pcm.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Audio chunk is too large." }, { status: 413 });
    }
    await appendLiveSpeechAudio(id, pcm);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const text = await finishLiveSpeechSession(id);
    return NextResponse.json({ text });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await cancelLiveSpeechSession(id);
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: { type: string; text?: string; error?: string }) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        if (event.type === "final" || event.type === "error") {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        }
      };
      try {
        const subscription = subscribeLiveSpeechSession(id, send);
        unsubscribe = subscription.unsubscribe;
        send({ type: "partial", text: subscription.transcript });
        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Speech session unavailable." });
      }
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  }, { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
