const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

export function isElevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export type SpeechLine = {
  text: string;
  voiceId?: string;
  label: string;
};

/** Override via ELEVENLABS_VOICE_ID. Free tier: use a cloned voice, not library. */
export function defaultVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID || "";
}

export const DEFAULT_AI_LINES: SpeechLine[] = [
  {
    label: "Casual check-in",
    text: "Hey, just got out of the meeting — can you send me the deck before 4? I want to skim it on the train.",
  },
  {
    label: "Voicemail",
    text: "Hi, you've reached Maya. I'm away from my phone right now, but leave a message and I'll call you back this afternoon.",
  },
  {
    label: "Podcast clip",
    text: "What surprised me most was how quickly the models started sounding like people I actually know — not robots, just… a little too smooth.",
  },
  {
    label: "Rant to friend",
    text: "No but listen — I told them twice that the timeline was fake, and they still put Friday on the slide like that means anything.",
  },
  {
    label: "Customer support",
    text: "Thanks for holding. I can see the charge from March twelfth — if you want, I can reverse it now and email you the confirmation.",
  },
];

export type ElevenVoice = {
  voice_id: string;
  name?: string;
  category?: string;
};

let cachedVoices: ElevenVoice[] | null = null;

function rank(c?: string) {
  return c === "cloned" ? 0 : c === "generated" ? 1 : c === "premade" ? 2 : 9;
}

/** Usable voices for free API (excludes Voice Library). */
export async function listUsableVoices(): Promise<ElevenVoice[]> {
  if (cachedVoices) return cachedVoices;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  const res = await fetch(`${ELEVEN_BASE}/voices`, {
    headers: { "xi-api-key": key },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs voices ${res.status}: ${body.slice(0, 240)}`);
  }

  const data = (await res.json()) as { voices?: ElevenVoice[] };
  const usable = (data.voices ?? [])
    .filter((v) => v.category !== "library")
    .sort((a, b) => rank(a.category) - rank(b.category));

  if (!usable.length) {
    throw new Error(
      "No usable ElevenLabs voice on this account. Free tier cannot use library voices — clone voices in the ElevenLabs UI, or upgrade for Voice Library API access.",
    );
  }

  cachedVoices = usable;
  return usable;
}

export async function resolveVoiceId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromEnv = defaultVoiceId();
  if (fromEnv) return fromEnv;
  const voices = await listUsableVoices();
  return voices[0]!.voice_id;
}

/** Rotate across all usable voices for variety. */
export async function resolveVoiceIdForIndex(index: number): Promise<{
  voiceId: string;
  name?: string;
}> {
  const fromEnv = defaultVoiceId();
  if (fromEnv) return { voiceId: fromEnv, name: "env" };
  const voices = await listUsableVoices();
  const v = voices[index % voices.length]!;
  return { voiceId: v.voice_id, name: v.name };
}

export async function synthesizeSpeech(opts: {
  text: string;
  voiceId?: string;
}): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  const voiceId = await resolveVoiceId(opts.voiceId);
  const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 240)}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
