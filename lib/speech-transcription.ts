import "server-only";

import { existsSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import type { FoundryLocalManager, IModel } from "foundry-local-sdk";

const MODEL_ALIASES = [
  "nemotron-3.5-asr-streaming-0.6b",
  "nemotron-speech-streaming-en-0.6b",
] as const;
const MODEL_INFO_FILE = "foundry.modelinfo.json";
const CORE_DLL = "Microsoft.AI.Foundry.Local.Core.dll";
const APP_NAME = "pi-web-speech";
const STREAM_CHUNK_BYTES = 32 * 1024;

type FoundryLiveSession = ReturnType<ReturnType<IModel["createAudioClient"]>["createLiveTranscriptionSession"]>;

type LiveSpeechEvent = {
  type: "partial" | "final" | "error";
  text?: string;
  committed?: string;
  partial?: string;
  error?: string;
};
type LiveSpeechListener = (event: LiveSpeechEvent) => void;
interface LiveSpeechSession {
  sdk: FoundryLiveSession;
  committed: string;
  tail: string;
  transcript: string;
  listeners: Set<LiveSpeechListener>;
  drain: Promise<void>;
  drainError?: Error;
  finishing?: Promise<string>;
  expires: ReturnType<typeof setTimeout>;
}

type SpeechGlobals = typeof globalThis & {
  __piSpeechManagerPromise?: Promise<FoundryLocalManager>;
  __piSpeechModelPromise?: Promise<IModel>;
  __piLiveSpeechSessions?: Map<string, LiveSpeechSession>;
};

function findCacheRoot(configuredPath: string): string | null {
  let current = configuredPath;
  for (let depth = 0; depth < 6; depth++) {
    if (existsSync(join(current, MODEL_INFO_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveModelCacheDir(): string {
  const configured = process.env.PI_WEB_SPEECH_MODEL_DIR;
  if (configured) {
    const root = findCacheRoot(configured);
    if (root) return root;
    throw new Error(`Speech model cache is invalid: ${configured}`);
  }

  const appData = process.env.APPDATA;
  if (appData) {
    const codeCache = join(appData, "Code", "chatDictationModels");
    if (existsSync(join(codeCache, MODEL_INFO_FILE))) return codeCache;
  }

  throw new Error(
    "Nemotron speech model was not found. Set PI_WEB_SPEECH_MODEL_DIR to the existing Foundry Local model cache.",
  );
}

function compareVersionsDescending(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

function resolveFoundryLibrary(): string | undefined {
  const configured = process.env.PI_WEB_FOUNDRY_LIBRARY_PATH;
  if (configured) {
    const library = configured.toLowerCase().endsWith(".dll") ? configured : join(configured, CORE_DLL);
    if (!existsSync(library)) throw new Error(`Foundry Local runtime was not found: ${library}`);
    return library;
  }

  if (process.platform !== "win32" || !process.env.APPDATA) return undefined;
  const runtimeRoot = join(process.env.APPDATA, "Code", "chatDictationRuntime");
  if (!existsSync(runtimeRoot)) return undefined;
  for (const version of readdirSync(runtimeRoot).sort(compareVersionsDescending)) {
    const library = join(runtimeRoot, version, "foundry-local-core", `win32-${process.arch}`, CORE_DLL);
    if (existsSync(library)) return library;
  }
  return undefined;
}

async function getManager(): Promise<FoundryLocalManager> {
  const globals = globalThis as SpeechGlobals;
  if (!globals.__piSpeechManagerPromise) {
    globals.__piSpeechManagerPromise = (async () => {
      const { FoundryLocalManager } = await import("foundry-local-sdk");
      const libraryPath = resolveFoundryLibrary();
      return FoundryLocalManager.createAsync({
        appName: APP_NAME,
        modelCacheDir: resolveModelCacheDir(),
        ...(libraryPath ? { libraryPath } : {}),
        logLevel: "warn",
        // Include the public catalog while retaining models already present in the cache.
        additionalSettings: { AzureCatalogFilter: "'',test" },
      });
    })().catch((error) => {
      delete globals.__piSpeechManagerPromise;
      throw error;
    });
  }
  return globals.__piSpeechManagerPromise;
}

async function getSpeechModel(): Promise<IModel> {
  const globals = globalThis as SpeechGlobals;
  if (!globals.__piSpeechModelPromise) {
    globals.__piSpeechModelPromise = (async () => {
      const manager = await getManager();
      const cached = await manager.catalog.getCachedModels();
      const model = MODEL_ALIASES
        .map((alias) => cached.find((candidate) => candidate.alias === alias))
        .find((candidate): candidate is IModel => Boolean(candidate));
      if (!model) {
        throw new Error(
          `The cached Nemotron speech model is unavailable. Expected one of: ${MODEL_ALIASES.join(", ")}. No model was downloaded.`,
        );
      }
      await model.load();
      return model;
    })().catch((error) => {
      delete globals.__piSpeechModelPromise;
      throw error;
    });
  }
  return globals.__piSpeechModelPromise;
}

export async function warmSpeechModel(): Promise<void> {
  await getSpeechModel();
}

function responseText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const first = content[0];
  return first && typeof first === "object" && typeof (first as { text?: unknown }).text === "string"
    ? (first as { text: string }).text
    : "";
}

function liveSessions(): Map<string, LiveSpeechSession> {
  const globals = globalThis as SpeechGlobals;
  return globals.__piLiveSpeechSessions ??= new Map();
}

function emitSpeechEvent(session: LiveSpeechSession, event: LiveSpeechEvent): void {
  for (const listener of session.listeners) listener(event);
}

async function disposeLiveSession(id: string, session: LiveSpeechSession): Promise<void> {
  clearTimeout(session.expires);
  liveSessions().delete(id);
  await session.sdk.dispose().catch(() => undefined);
}

export async function createLiveSpeechSession(): Promise<string> {
  const model = await getSpeechModel();
  const sdk = model.createAudioClient().createLiveTranscriptionSession();
  sdk.settings.sampleRate = 16_000;
  sdk.settings.channels = 1;
  sdk.settings.bitsPerSample = 16;
  sdk.settings.language = "en";
  await sdk.start();

  const id = randomUUID();
  const session: LiveSpeechSession = {
    sdk,
    committed: "",
    tail: "",
    transcript: "",
    listeners: new Set(),
    drain: Promise.resolve(),
    expires: setTimeout(() => { void cancelLiveSpeechSession(id); }, 3 * 60 * 1000),
  };
  session.drain = (async () => {
    try {
      for await (const response of sdk.getStream()) {
        const text = responseText(response);
        if (!text) continue;
        if (response.is_final) {
          session.committed += text;
          session.tail = "";
        } else {
          session.tail += text;
        }
        session.transcript = (session.committed + session.tail).trim();
        emitSpeechEvent(session, {
          type: "partial",
          text: session.transcript,
          committed: session.committed.trim(),
          partial: session.tail.trim(),
        });
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("Live transcription failed.");
      session.drainError = failure;
      emitSpeechEvent(session, { type: "error", error: failure.message });
    }
  })();
  liveSessions().set(id, session);
  return id;
}

function requireLiveSession(id: string): LiveSpeechSession {
  const session = liveSessions().get(id);
  if (!session) throw new Error("Speech session was not found or has expired.");
  return session;
}

export async function appendLiveSpeechAudio(id: string, pcm: Uint8Array): Promise<void> {
  if (pcm.byteLength === 0 || pcm.byteLength % 2 !== 0) throw new Error("Invalid PCM audio data");
  const session = requireLiveSession(id);
  if (session.finishing) throw new Error("Speech session is already finishing.");
  await session.sdk.append(pcm);
}

export function subscribeLiveSpeechSession(
  id: string,
  listener: LiveSpeechListener,
): { transcript: string; unsubscribe: () => void } {
  const session = requireLiveSession(id);
  session.listeners.add(listener);
  return {
    transcript: session.transcript,
    unsubscribe: () => session.listeners.delete(listener),
  };
}

export async function finishLiveSpeechSession(id: string): Promise<string> {
  const session = requireLiveSession(id);
  if (!session.finishing) {
    session.finishing = (async () => {
      try {
        await session.sdk.stop();
        await session.drain;
        if (session.drainError) throw session.drainError;
        session.transcript = (session.committed + session.tail).trim();
        emitSpeechEvent(session, { type: "final", text: session.transcript });
        return session.transcript;
      } finally {
        await disposeLiveSession(id, session);
      }
    })();
  }
  return session.finishing;
}

export async function cancelLiveSpeechSession(id: string): Promise<void> {
  const session = liveSessions().get(id);
  if (!session) return;
  emitSpeechEvent(session, { type: "final", text: session.transcript });
  await disposeLiveSession(id, session);
}

export async function transcribePcm(pcm: Uint8Array): Promise<string> {
  if (pcm.byteLength === 0 || pcm.byteLength % 2 !== 0) throw new Error("Invalid PCM audio data");

  const model = await getSpeechModel();
  const session = model.createAudioClient().createLiveTranscriptionSession();
  session.settings.sampleRate = 16_000;
  session.settings.channels = 1;
  session.settings.bitsPerSample = 16;
  session.settings.language = "en";

  let committed = "";
  let tail = "";
  try {
    await session.start();
    const drain = (async () => {
      for await (const response of session.getStream()) {
        const text = responseText(response);
        if (!text) continue;
        if (response.is_final) {
          committed += text;
          tail = "";
        } else {
          tail += text;
        }
      }
    })();

    for (let offset = 0; offset < pcm.byteLength; offset += STREAM_CHUNK_BYTES) {
      await session.append(pcm.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, pcm.byteLength)));
    }
    await session.stop();
    await drain;
    return (committed + tail).trim();
  } finally {
    await session.dispose().catch(() => undefined);
  }
}
