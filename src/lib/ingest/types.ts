export type IngestSource =
  | "unsplash"
  | "pixabay"
  | "pollinations"
  | "huggingface"
  | "sdfvd"
  | "aivideo"
  | "openspeech"
  | "commonvoice"
  | "elevenlabs"
  | "edgetts"
  | "openai-tts";

export type IngestResult = {
  source: IngestSource;
  inserted: number;
  /** Skipped because (source, external_id) already in library */
  skipped?: number;
  ids: string[];
  errors: string[];
  note?: string;
};

export type ProviderStatus = {
  unsplash: boolean;
  pixabay: boolean;
  pollinations: boolean; // works anonymously
  huggingface: boolean; // optional token
  sdfvd: boolean;
  aivideo: boolean;
  openspeech: boolean;
  commonvoice: boolean;
  elevenlabs: boolean;
  edgetts: boolean;
  openaiTts: boolean;
  supabase: boolean;
  /** LiteLLM / Ollama / OpenAI for keep-time analysis */
  analysis: boolean;
  analysisLabel?: string;
};
