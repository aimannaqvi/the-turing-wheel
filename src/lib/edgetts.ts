import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Microsoft Edge neural TTS — free, no API key, many distinct voices.
 * Great AI-speech variety without upgrading ElevenLabs.
 */

export const EDGE_VOICES = [
  "en-US-JennyNeural",
  "en-US-GuyNeural",
  "en-US-AriaNeural",
  "en-US-DavisNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
  "en-AU-NatashaNeural",
  "en-AU-WilliamNeural",
  "en-IE-ConnorNeural",
  "en-CA-LiamNeural",
] as const;

export const EDGE_TTS_LINES = [
  {
    label: "Casual check-in",
    text: "Hey, can you send over the notes from standup? I missed the first ten minutes.",
  },
  {
    label: "Voicemail",
    text: "Hi, this is Jordan. Leave a message and I'll get back to you tonight.",
  },
  {
    label: "Podcast clip",
    text: "The weird part is how natural it sounds until you listen for the breath — then it falls apart.",
  },
  {
    label: "Rant to friend",
    text: "I told them the deadline was fake, and they still put Friday on the calendar like that means something.",
  },
  {
    label: "Customer support",
    text: "I can refund the March charge now, and you'll get an email confirmation within a few minutes.",
  },
] as const;

export function isEdgeTtsConfigured() {
  return true;
}

export async function synthesizeEdgeSpeech(opts: {
  text: string;
  voice?: string;
}): Promise<Buffer> {
  const voice = opts.voice || EDGE_VOICES[0];
  const dir = await mkdtemp(join(tmpdir(), "ttw-edge-"));
  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(
        voice,
        OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
      );
      // toFile writes <dir>/<hash>.mp3 (or returns path depending on version)
      const result = await tts.toFile(dir, opts.text);
      const path =
        typeof result === "string"
          ? result
          : (result as { audioFilePath?: string }).audioFilePath ||
            join(dir, "audio.mp3");

      // package sometimes returns the directory; find mp3
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch {
        const { readdir } = await import("node:fs/promises");
        const files = await readdir(dir);
        const mp3 = files.find((f) => f.endsWith(".mp3"));
        if (!mp3) throw new Error("Edge TTS wrote no mp3");
        bytes = await readFile(join(dir, mp3));
      }

      if (bytes.length < 100) throw new Error("Edge TTS returned empty audio");
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return bytes;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      try {
        tts.close();
      } catch {
        /* ignore */
      }
    }
  }

  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
