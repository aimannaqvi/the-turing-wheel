/**
 * Per-item “How do we know?” bullets — generated when an admin keeps/approves.
 *
 * Provider order:
 *   1) Ollama OpenAI-compat (OLLAMA_BASE_URL + OLLAMA_MODEL) if reachable
 *   2) Hugging Face router (HF_TOKEN + ANALYSIS_HF_MODEL)
 *   3) Explicit ANALYSIS_BASE_URL / OPENAI_API_KEY fallbacks
 *
 * Modalities:
 *   image → vision model + full image
 *   video → ffmpeg frames + vision model
 *   audio → Whisper (+ HF ASR fallback) + text reasoning
 */

import {
  audioProbe,
  extractVideoFrames,
  toImageDataUrl,
  transcribeAudio,
} from "@/lib/analysisMedia";

export type AnalysisInput = {
  title?: string | null;
  mediaType: string;
  isAi: boolean;
  provenance?: string | null;
  mediaUrl?: string | null;
  thumbUrl?: string | null;
  textContent?: string | null;
};

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** Detects the old generic templates so we can refuse / regenerate them. */
export function isTemplateAnalysisBullets(
  bullets: string[] | null | undefined,
): boolean {
  if (!bullets?.length) return true;
  const joined = bullets.join(" ").toLowerCase();
  const markers = [
    "plastic skin and too-perfect symmetry",
    "background text, fingers, and jewelry edges often break first",
    "lighting can look studio-perfect without a real light source",
    "imperfect skin texture and optical noise are clues",
    "real lenses leave chromatic aberration and soft corners",
    "crowds and hands usually stay physically consistent in photos",
    "pacing and breath often feel too even",
    "sibilants and room tone can sound glassy",
    "watch temporal morph: hands, teeth, and edges that melt",
    "physics on hair/cloth can look over-smooth or rubbery",
    "identity drift across cuts is a classic t2v tell",
    "optical capture keeps messy focus hunting",
    "limb intersections and motion blur usually stay physically consistent",
    "real video has uneven exposure and sensor noise",
  ];
  return markers.some((m) => joined.includes(m));
}

export function hasUsableAnalysis(
  bullets: string[] | null | undefined,
): boolean {
  return Boolean(bullets?.length) && !isTemplateAnalysisBullets(bullets);
}

export type AnalysisEndpoint = {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  provider: "ollama" | "hf" | "openai" | "custom";
  local: boolean;
};

async function ollamaReachable(baseUrl: string): Promise<boolean> {
  try {
    const root = baseUrl.replace(/\/v1\/?$/, "");
    const res = await fetch(`${root}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveAnalysisEndpoint(): Promise<AnalysisEndpoint | null> {
  const ollamaBase = (
    process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1"
  ).replace(/\/+$/, "");
  const ollamaModel =
    process.env.OLLAMA_MODEL?.trim() || "qwen2.5vl:7b";

  if (await ollamaReachable(ollamaBase)) {
    return {
      baseUrl: ollamaBase.endsWith("/v1") ? ollamaBase : `${ollamaBase}/v1`,
      apiKey: "ollama",
      model: ollamaModel,
      provider: "ollama",
      local: true,
    };
  }

  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
  if (hfToken) {
    return {
      baseUrl: "https://router.huggingface.co/v1",
      apiKey: hfToken,
      model:
        process.env.ANALYSIS_HF_MODEL?.trim() ||
        "Qwen/Qwen2.5-VL-7B-Instruct",
      provider: "hf",
      local: false,
    };
  }

  const baseRaw =
    process.env.ANALYSIS_BASE_URL?.trim() ||
    process.env.LITELLM_BASE_URL?.trim() ||
    "";
  const model =
    process.env.ANALYSIS_MODEL?.trim() ||
    process.env.LITELLM_MODEL?.trim() ||
    "";
  const key =
    process.env.ANALYSIS_API_KEY?.trim() ||
    process.env.LITELLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    null;

  if (baseRaw && model) {
    const baseUrl = baseRaw.replace(/\/+$/, "");
    return {
      baseUrl,
      apiKey: key || "sk-local",
      model,
      provider: "custom",
      local: !/api\.openai\.com|huggingface\.co/i.test(baseUrl),
    };
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY.trim(),
      model: process.env.ANALYSIS_MODEL?.trim() || "gpt-4o",
      provider: "openai",
      local: false,
    };
  }

  return null;
}

export async function isAnalysisConfigured(): Promise<boolean> {
  return (await resolveAnalysisEndpoint()) != null;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function forensicsSystem(): string {
  return [
    "You are a media forensics educator for a Real-vs-AI daily puzzle.",
    "Ground truth is given — explain why THIS item matches that label.",
    "Be concrete, item-specific, and terse. Cite what you see/hear.",
    "Never invent generic filler. Never cite datasets or URLs.",
  ].join(" ");
}

function baseInstructions(input: AnalysisInput, extra: string[]): string {
  return [
    `Ground truth: ${input.isAi ? "AI-generated / synthetic" : "REAL (captured / human)"}.`,
    `Media type: ${input.mediaType}.`,
    `Title: ${input.title || "(untitled)"}.`,
    `Provenance (internal, do NOT cite): ${input.provenance || "unknown"}.`,
    input.textContent
      ? `Known text/caption: ${input.textContent.slice(0, 400)}`
      : "",
    ...extra,
    "",
    "Write 2–4 short bullet points for a puzzle player answering “How do we know?”",
    "Every bullet MUST reference specifics from THIS media (subjects, clothing, setting, lighting, motion, speech, room tone).",
    "Do NOT use stock phrases like “plastic skin”, “too-perfect symmetry”, or “chromatic aberration” unless clearly visible here.",
    "Return ONLY a JSON array of strings.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildUserParts(input: AnalysisInput): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];

  if (input.mediaType === "image") {
    if (!input.mediaUrl) throw new AnalysisError("image missing mediaUrl");
    const dataUrl = await toImageDataUrl(input.mediaUrl);
    parts.push({
      type: "text",
      text: baseInstructions(input, [
        "Inspect the attached image carefully for optical vs generative tells.",
      ]),
    });
    parts.push({ type: "image_url", image_url: { url: dataUrl } });
    return parts;
  }

  if (input.mediaType === "video") {
    if (!input.mediaUrl) throw new AnalysisError("video missing mediaUrl");
    const frames = await extractVideoFrames(input.mediaUrl, 3);
    parts.push({
      type: "text",
      text: baseInstructions(input, [
        `Attached: ${frames.length} frames sampled evenly across the clip.`,
        "Compare frames for temporal morph, identity drift, physics on hair/cloth/hands, and optical capture noise vs over-smooth gen.",
      ]),
    });
    for (const url of frames) {
      parts.push({ type: "image_url", image_url: { url } });
    }
    return parts;
  }

  if (input.mediaType === "audio") {
    if (!input.mediaUrl) throw new AnalysisError("audio missing mediaUrl");
    const probe = await audioProbe(input.mediaUrl);
    let transcript = (input.textContent || "").trim();
    let asrSource = "provided";
    if (!transcript) {
      try {
        const t = await transcribeAudio(input.mediaUrl);
        transcript = t.transcript;
        asrSource = t.source;
      } catch (e) {
        console.error("asr failed", e);
        transcript = "(transcription unavailable)";
      }
    }
    parts.push({
      type: "text",
      text: baseInstructions(input, [
        `Audio probe: ${probe.notes}.`,
        `Transcript (${asrSource}): “${transcript.slice(0, 600)}”`,
        input.isAi
          ? "Focus on TTS tells: even pacing, missing breath/mouth noise, glassy sibilants, dead room."
          : "Focus on human tells: breath, room tone, mic distance, flubs, uneven pacing.",
      ]),
    });
    return parts;
  }

  // text / other
  parts.push({
    type: "text",
    text: baseInstructions(input, [
      "Reason from the text content and ground truth only.",
    ]),
  });
  return parts;
}

/** Ollama native /api/chat — honors num_ctx; images as raw base64. */
async function ollamaChat(
  endpoint: AnalysisEndpoint,
  userParts: ContentPart[],
): Promise<string> {
  const root = endpoint.baseUrl.replace(/\/v1\/?$/, "");
  const images: string[] = [];
  const textBits: string[] = [];
  for (const p of userParts) {
    if (p.type === "text") textBits.push(p.text);
    else if (p.type === "image_url") {
      const url = p.image_url.url;
      const b64 = url.startsWith("data:")
        ? url.replace(/^data:[^;]+;base64,/, "")
        : url;
      images.push(b64);
    }
  }

  const res = await fetch(`${root}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      options: {
        temperature: 0.35,
        num_ctx: 16384,
      },
      messages: [
        { role: "system", content: forensicsSystem() },
        {
          role: "user",
          content: textBits.join("\n\n"),
          images: images.length ? images : undefined,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("analysis ollama", res.status, detail);
    throw new AnalysisError(
      `Ollama failed (${res.status}) model=${endpoint.model}. ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    message?: { content?: string };
  };
  return (json.message?.content || "").trim();
}

async function chatCompletions(
  endpoint: AnalysisEndpoint,
  userParts: ContentPart[],
): Promise<string> {
  if (endpoint.provider === "ollama") {
    return ollamaChat(endpoint, userParts);
  }

  const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.35,
      messages: [
        { role: "system", content: forensicsSystem() },
        { role: "user", content: userParts },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("analysis llm", endpoint.provider, res.status, detail);
    throw new AnalysisError(
      `Analysis LLM failed (${res.status}) via ${endpoint.provider} model=${endpoint.model}. ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | ContentPart[] } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function parseBullets(raw: string): string[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    throw new AnalysisError(
      `Analysis LLM returned non-JSON: ${raw.slice(0, 220)}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((x) => typeof x === "string") ||
    parsed.length === 0
  ) {
    throw new AnalysisError("Analysis LLM returned empty/invalid bullets");
  }
  const bullets = parsed.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (isTemplateAnalysisBullets(bullets)) {
    throw new AnalysisError(
      "Analysis looked generic — regenerate or use a stronger vision model",
    );
  }
  return bullets;
}

export async function generateAnalysisBullets(
  input: AnalysisInput,
): Promise<string[]> {
  const endpoint = await resolveAnalysisEndpoint();
  if (!endpoint) {
    throw new AnalysisError(
      "No analysis LLM — start Ollama (qwen2.5vl:7b) or set HF_TOKEN",
    );
  }

  const userParts = await buildUserParts(input);
  const raw = await chatCompletions(endpoint, userParts);
  return parseBullets(raw);
}
