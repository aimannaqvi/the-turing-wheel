import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** True if bytes look like an MP4/MOV with an audio sample entry. */
export function hasAudioTrack(bytes: Buffer): boolean {
  // ISO-BMFF sample entries / codecs commonly present when audio exists
  return (
    bytes.includes(Buffer.from("mp4a")) ||
    bytes.includes(Buffer.from("soun")) ||
    bytes.includes(Buffer.from("opus")) ||
    bytes.includes(Buffer.from("mp3 ")) ||
    bytes.includes(Buffer.from("ac-3")) ||
    bytes.includes(Buffer.from("sowt")) ||
    bytes.includes(Buffer.from("twos"))
  );
}

/** True if browser-hostile MPEG-4 Visual (mp4v) is the video codec. */
export function isMpeg4Visual(bytes: Buffer): boolean {
  return bytes.includes(Buffer.from("mp4v")) && !bytes.includes(Buffer.from("avc1"));
}

/** Fragmented MP4 (fMP4) often loses reliable audio after re-hosting. */
export function isFragmentedMp4(bytes: Buffer): boolean {
  return bytes.includes(Buffer.from("moof"));
}

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg-static binary missing");
  return p;
}

/**
 * Remux/transcode to progressive H.264 + AAC with faststart.
 * Prefer stream-copy video when already avc1 (keeps quality, fixes fMP4 audio).
 */
export async function toBrowserMp4(
  input: Buffer,
  opts?: { keepAudio?: boolean },
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ttw-ffmpeg-"));
  const inPath = join(dir, "in.mp4");
  const outPath = join(dir, "out.mp4");
  await writeFile(inPath, input);

  const keepAudio = opts?.keepAudio !== false && hasAudioTrack(input);
  const canCopyVideo =
    input.includes(Buffer.from("avc1")) && !isMpeg4Visual(input);

  const args = ["-y", "-i", inPath, "-movflags", "+faststart"];
  if (canCopyVideo) {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast");
  }
  if (keepAudio) {
    args.push("-c:a", "aac", "-b:a", "160k");
  } else {
    args.push("-an");
  }
  args.push(outPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
    });
  });

  try {
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
