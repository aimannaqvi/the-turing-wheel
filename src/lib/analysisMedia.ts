import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg-static binary missing");
  return p;
}

async function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(err);
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
    });
  });
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "the-turing-wheel/0.1" },
  });
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function toImageDataUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "the-turing-wheel/0.1" },
  });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const ctype = res.headers.get("content-type") || "image/jpeg";
  if (!ctype.startsWith("image/")) {
    throw new Error(`not an image: ${ctype}`);
  }
  let buf = Buffer.from(await res.arrayBuffer());
  // Downscale large stills so local VL context stays sane
  if (buf.length > 400_000) {
    const dir = await mkdtemp(join(tmpdir(), "ttw-img-"));
    const inPath = join(dir, "in.bin");
    const outPath = join(dir, "out.jpg");
    await writeFile(inPath, buf);
    try {
      await runFfmpeg([
        "-y",
        "-i",
        inPath,
        "-vf",
        "scale='min(1024,iw)':-2",
        "-q:v",
        "5",
        outPath,
      ]);
      buf = await readFile(outPath);
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return `data:${ctype.split(";")[0]};base64,${buf.toString("base64")}`;
}

/** Extract n evenly spaced JPEG frames as data URLs. */
export async function extractVideoFrames(
  mediaUrl: string,
  n = 5,
): Promise<string[]> {
  const bytes = await fetchBytes(mediaUrl);
  const dir = await mkdtemp(join(tmpdir(), "ttw-frames-"));
  const inPath = join(dir, "in.mp4");
  await writeFile(inPath, bytes);

  try {
    // Probe duration
    const probe = await runFfmpeg(["-i", inPath, "-f", "null", "-"]);
    const durMatch = probe.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    let duration = 4;
    if (durMatch) {
      duration =
        Number(durMatch[1]) * 3600 +
        Number(durMatch[2]) * 60 +
        Number(durMatch[3]);
    }
    duration = Math.max(duration, 0.5);
    // Keep frame count + resolution low so local VL context fits (esp. 4k default)
    const count = Math.min(Math.max(n, 3), 4);
    const fps = count / duration;

    const pattern = join(dir, "frame-%02d.jpg");
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-vf",
      `fps=${fps.toFixed(4)},scale='min(512,iw)':-2`,
      "-frames:v",
      String(count),
      "-q:v",
      "8",
      pattern,
    ]);

    const files = (await readdir(dir))
      .filter((f) => f.startsWith("frame-") && f.endsWith(".jpg"))
      .sort();
    const out: string[] = [];
    for (const f of files.slice(0, count)) {
      const buf = await readFile(join(dir, f));
      // Skip near-empty frames
      if (buf.length < 800) continue;
      out.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
    }
    if (!out.length) {
      throw new Error("no usable frames extracted from video");
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type AudioProbe = {
  durationSec: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  silenceRatio: number | null;
  notes: string;
};

export async function audioProbe(mediaUrl: string): Promise<AudioProbe> {
  const bytes = await fetchBytes(mediaUrl);
  const dir = await mkdtemp(join(tmpdir(), "ttw-audio-"));
  const inPath = join(dir, "in.audio");
  await writeFile(inPath, bytes);

  try {
    const volLog = await runFfmpeg([
      "-i",
      inPath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    const durMatch = volLog.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    let durationSec = 0;
    if (durMatch) {
      durationSec =
        Number(durMatch[1]) * 3600 +
        Number(durMatch[2]) * 60 +
        Number(durMatch[3]);
    }
    const meanM = volLog.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    const maxM = volLog.match(/max_volume:\s*(-?[\d.]+)\s*dB/);

    let silenceRatio: number | null = null;
    try {
      const silLog = await runFfmpeg([
        "-i",
        inPath,
        "-af",
        "silencedetect=noise=-35dB:d=0.25",
        "-f",
        "null",
        "-",
      ]);
      const starts = [...silLog.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) =>
        Number(m[1]),
      );
      const ends = [...silLog.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) =>
        Number(m[1]),
      );
      let silence = 0;
      for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        silence += Math.max(0, ends[i]! - starts[i]!);
      }
      if (durationSec > 0) {
        silenceRatio = Math.min(1, silence / durationSec);
      }
    } catch {
      /* optional */
    }

    const meanVolumeDb = meanM ? Number(meanM[1]) : null;
    const maxVolumeDb = maxM ? Number(maxM[1]) : null;
    const notes = [
      `duration=${durationSec.toFixed(2)}s`,
      meanVolumeDb != null ? `mean=${meanVolumeDb}dB` : null,
      maxVolumeDb != null ? `peak=${maxVolumeDb}dB` : null,
      silenceRatio != null
        ? `silence≈${(silenceRatio * 100).toFixed(0)}%`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      durationSec,
      meanVolumeDb,
      maxVolumeDb,
      silenceRatio,
      notes,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type WhisperPipeline = (audio: Float32Array | string, opts?: Record<string, unknown>) => Promise<{
  text?: string;
}>;

let whisperPromise: Promise<WhisperPipeline> | null = null;

async function getWhisper(): Promise<WhisperPipeline> {
  if (!whisperPromise) {
    whisperPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return (await pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-base",
      )) as unknown as WhisperPipeline;
    })();
  }
  return whisperPromise;
}

/** Convert arbitrary audio bytes to 16kHz mono wav for Whisper. */
async function toWav16k(bytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ttw-wav-"));
  const inPath = join(dir, "in.audio");
  const outPath = join(dir, "out.wav");
  await writeFile(inPath, bytes);
  try {
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function wavToFloat32(wav: Buffer): Float32Array {
  // Minimal WAV PCM s16le reader (ffmpeg output)
  let offset = 12;
  let dataOffset = 44;
  let sampleRate = 16000;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      sampleRate = wav.readUInt32LE(offset + 12);
    }
    if (id === "data") {
      dataOffset = offset + 8;
      const samples = Math.floor(size / 2);
      const out = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        out[i] = wav.readInt16LE(dataOffset + i * 2) / 32768;
      }
      if (sampleRate !== 16000) {
        // Whisper pipeline expects 16k; we convert via ffmpeg already
      }
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("invalid wav for whisper");
}

export async function transcribeLocal(mediaUrl: string): Promise<string> {
  const bytes = await fetchBytes(mediaUrl);
  const wav = await toWav16k(bytes);
  const audio = wavToFloat32(wav);
  const asr = await getWhisper();
  const result = await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  });
  return (result.text || "").trim();
}

/** HF Inference ASR fallback (openai/whisper-base). */
export async function transcribeViaHf(mediaUrl: string): Promise<string> {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (!token) throw new Error("HF_TOKEN missing for ASR fallback");

  const bytes = await fetchBytes(mediaUrl);
  const wav = await toWav16k(bytes);
  const model =
    process.env.ANALYSIS_HF_ASR_MODEL?.trim() || "openai/whisper-base";

  const res = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "audio/wav",
      },
      body: new Uint8Array(wav),
    },
  );
  if (!res.ok) {
    throw new Error(`HF ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string } | Array<{ text?: string }>;
  if (Array.isArray(json)) {
    return (json[0]?.text || "").trim();
  }
  return (json.text || "").trim();
}

export async function transcribeAudio(mediaUrl: string): Promise<{
  transcript: string;
  source: "local" | "hf";
}> {
  // Prefer HF ASR when token exists — local Whisper cold-start can hang 10+ min
  const hasHf = Boolean(
    process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN,
  );
  if (hasHf) {
    try {
      const transcript = await transcribeViaHf(mediaUrl);
      if (transcript) return { transcript, source: "hf" };
    } catch (e) {
      console.error("hf asr failed", e);
    }
  }
  try {
    const transcript = await transcribeLocal(mediaUrl);
    if (transcript) return { transcript, source: "local" };
  } catch (e) {
    console.error("local whisper failed", e);
  }
  throw new Error("ASR failed (HF + local Whisper)");
}
