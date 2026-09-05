"use client";

export const SPEECH_SAMPLE_RATE = 16_000;
export const MAX_SPEECH_RECORDING_MS = 2 * 60 * 1000;

export interface SpeechRecording {
  pcm: Uint8Array;
  sampleRate: number;
}

export interface PcmRecorder {
  /** Return and clear audio captured since the previous call. */
  takePcm(): SpeechRecording;
  stop(): Promise<SpeechRecording>;
  cancel(): Promise<void>;
}

/** Resample browser microphone samples and encode signed 16-bit little-endian PCM. */
export function encodePcm16(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
  outputSampleRate = SPEECH_SAMPLE_RATE,
): Uint8Array {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0 || outputSampleRate <= 0) {
    throw new Error("Invalid audio sample rate");
  }

  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (inputLength === 0) return new Uint8Array();

  const input = new Float32Array(inputLength);
  let inputOffset = 0;
  for (const chunk of chunks) {
    input.set(chunk, inputOffset);
    inputOffset += chunk.length;
  }

  const outputLength = Math.max(1, Math.floor(inputLength * outputSampleRate / inputSampleRate));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);
  const ratio = inputSampleRate / outputSampleRate;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
    const position = outputIndex * ratio;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    const sample = Math.max(-1, Math.min(1, input[left] + (input[right] - input[left]) * fraction));
    view.setInt16(outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return bytes;
}

export async function startPcmRecorder(): Promise<PcmRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording is not supported by this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Audio recording is not supported by this browser.");
  }

  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor remains the most broadly supported way to collect raw PCM without
  // shipping a separate AudioWorklet file. A muted gain keeps it active without echo.
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mutedOutput = context.createGain();
  mutedOutput.gain.value = 0;
  const chunks: Float32Array[] = [];
  let active = true;

  processor.onaudioprocess = (event) => {
    if (!active) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mutedOutput);
  mutedOutput.connect(context.destination);
  await context.resume();

  const drain = (): SpeechRecording => {
    const pcm = encodePcm16(chunks, context.sampleRate);
    chunks.length = 0;
    return { pcm, sampleRate: SPEECH_SAMPLE_RATE };
  };

  const close = async (keepAudio: boolean): Promise<SpeechRecording> => {
    if (!active) return { pcm: new Uint8Array(), sampleRate: SPEECH_SAMPLE_RATE };
    active = false;
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    mutedOutput.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => undefined);
    return keepAudio ? drain() : { pcm: new Uint8Array(), sampleRate: SPEECH_SAMPLE_RATE };
  };

  return {
    takePcm: drain,
    stop: () => close(true),
    cancel: async () => { await close(false); },
  };
}
