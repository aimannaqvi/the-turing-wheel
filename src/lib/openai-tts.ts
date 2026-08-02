/** Optional OpenAI TTS — set OPENAI_API_KEY for more AI voices. */

export const OPENAI_VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
] as const;

export type OpenAiVoice = (typeof OPENAI_VOICES)[number];

export const OPENAI_TTS_LINES = [
  {
    label: "OpenAI · casual",
    text: "Hey, just got out of the meeting — can you send me the deck before four?",
  },
  {
    label: "OpenAI · voicemail",
    text: "Hi, you've reached Sam. Leave a message and I'll call you back this afternoon.",
  },
  {
    label: "OpenAI · podcast",
    text: "What surprised me was how quickly the models started sounding like people I actually know.",
  },
] as const;

export function isOpenAiTtsConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function synthesizeOpenAiSpeech(opts: {
  text: string;
  voice?: OpenAiVoice;
}): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const voice = opts.voice || "nova";
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: opts.text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    // fallback older model name
    const err1 = await res.text();
    const res2 = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        voice,
        input: opts.text,
        response_format: "mp3",
      }),
    });
    if (!res2.ok) {
      throw new Error(
        `OpenAI TTS ${res2.status}: ${(await res2.text()).slice(0, 200) || err1.slice(0, 200)}`,
      );
    }
    return Buffer.from(await res2.arrayBuffer());
  }

  return Buffer.from(await res.arrayBuffer());
}
