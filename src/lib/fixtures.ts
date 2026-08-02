import { playDateCT } from "@/lib/date";
import type { Artifact, ArtifactReveal } from "@/lib/types";

type FixtureRow = Omit<ArtifactReveal, "playDate" | "analysisBullets">;

/** Shared AI video catalog — image artifacts reuse these thumbs. */
const AI_VIDEOS = [
  {
    key: "sd1",
    title: "Seedance 1",
    mediaUrl: "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0 (Higgsfield). Watch identity drift and background morph between cuts.",
  },
  {
    key: "sd2",
    title: "Seedance 2",
    mediaUrl: "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Cloth/hair physics and micro facial instability are the tells.",
  },
  {
    key: "sd3",
    title: "Seedance 3",
    mediaUrl: "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0 hero sample. Extremely photoreal; provenance is the hard tell.",
  },
  {
    key: "sd4",
    title: "Seedance 4",
    mediaUrl: "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Temporal edge flicker on hands/props.",
  },
  {
    key: "sd5",
    title: "Seedance 5",
    mediaUrl: "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/seedance/2.0",
    note: "AI — Seedance 2.0. Over-stable exposure vs optical capture.",
  },
  {
    key: "hf1",
    title: "Higgsfield cinema",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/01-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/01-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield Cinema Studio demo.",
  },
  {
    key: "hf2",
    title: "Higgsfield 02",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/02-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/02-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield sample. Micro-flicker on edges.",
  },
  {
    key: "hf3",
    title: "Higgsfield 03",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/03-mini.mp4",
    thumbUrl: "https://static.higgsfield.ai/ai-video-v2/03-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield sample.",
  },
  {
    key: "hf-e1",
    title: "Higgsfield gen 1",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/example-1-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-1-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
  },
  {
    key: "hf-e2",
    title: "Higgsfield gen 2",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/example-2-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-2-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
  },
  {
    key: "hf-e3",
    title: "Higgsfield gen 3",
    mediaUrl: "https://static.higgsfield.ai/ai-video-v2/example-3-mini.mp4",
    thumbUrl:
      "https://static.higgsfield.ai/ai-video-v2/example-3-mini-thumbnail.webp",
    proofUrl: "https://higgsfield.ai/ai-video",
    note: "AI — Higgsfield example reel.",
  },
] as const;

const REAL_IMAGES = [
  {
    id: "fix-img-r1",
    title: "Alpine ridge",
    url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&q=85",
    thumb:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=480&q=70",
    note: "Real photo. Atmospheric haze + optical DOF.",
  },
  {
    id: "fix-img-r2",
    title: "Neon alley",
    url: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1400&q=85",
    thumb:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=480&q=70",
    note: "Real night photography — messy speculars generators oversmooth.",
  },
  {
    id: "fix-img-r3",
    title: "Studio portrait",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1400&q=85",
    thumb:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480&q=70",
    note: "Real portrait that trips people — check hair edges / catchlights.",
  },
  {
    id: "fix-img-r4",
    title: "Still life",
    url: "https://images.unsplash.com/photo-1490312278390-ab6426f0bfa2?w=1400&q=85",
    thumb:
      "https://images.unsplash.com/photo-1490312278390-ab6426f0bfa2?w=480&q=70",
    note: "Real still-life. Micro-scratches on glaze.",
  },
  {
    id: "fix-img-r5",
    title: "Crosswalk",
    url: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=85",
    thumb:
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=480&q=70",
    note: "Real crowd scene — limb intersections still expose gens.",
  },
] as const;

/** Open Speech Repository — real people reading English sentences. */
const REAL_SPEECH = [
  ["0010", "Open speech 10"],
  ["0011", "Open speech 11"],
  ["0012", "Open speech 12"],
  ["0013", "Open speech 13"],
  ["0014", "Open speech 14"],
  ["0015", "Open speech 15"],
  ["0016", "Open speech 16"],
  ["0017", "Open speech 17"],
  ["0018", "Open speech 18"],
  ["0019", "Open speech 19"],
  ["0030", "Open speech 30"],
  ["0040", "Open speech 40"],
] as const;

function buildRows(): FixtureRow[] {
  const rows: FixtureRow[] = [];
  let sort = 1;

  for (const img of REAL_IMAGES) {
    rows.push({
      id: img.id,
      sortOrder: sort++,
      mediaType: "image",
      title: img.title,
      mediaUrl: img.url,
      thumbUrl: img.thumb,
      textContent: null,
      isAi: false,
      proofUrl: null,
      educationalNote: img.note,
    });
  }

  // AI images = frames from the AI videos (same thumbs)
  for (const v of AI_VIDEOS) {
    rows.push({
      id: `fix-img-ai-${v.key}`,
      sortOrder: sort++,
      mediaType: "image",
      title: `${v.title} frame`,
      mediaUrl: v.thumbUrl,
      thumbUrl: v.thumbUrl,
      textContent: null,
      isAi: true,
      proofUrl: v.proofUrl,
      educationalNote: `AI still extracted from ${v.title} (Higgsfield/Seedance CDN thumb). Same provenance as the video clip.`,
    });
  }

  for (const v of AI_VIDEOS) {
    rows.push({
      id: `fix-vid-${v.key}`,
      sortOrder: sort++,
      mediaType: "video",
      title: v.title,
      mediaUrl: v.mediaUrl,
      thumbUrl: v.thumbUrl,
      textContent: null,
      isAi: true,
      proofUrl: v.proofUrl,
      educationalNote: v.note,
    });
  }

  // A couple real videos that trip people up
  rows.push(
    {
      id: "fix-vid-real-flower",
      sortOrder: sort++,
      mediaType: "video",
      title: "Flower",
      mediaUrl:
        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      thumbUrl:
        "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=480&q=70",
      textContent: null,
      isAi: false,
      proofUrl:
        "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video",
      educationalNote:
        "Real CC0 clip. Soft organic motion — easy to mistake for gen at a glance.",
    },
    {
      id: "fix-vid-real-sample",
      sortOrder: sort++,
      mediaType: "video",
      title: "Sample plate",
      mediaUrl: "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
      thumbUrl:
        "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=480&q=70",
      textContent: null,
      isAi: false,
      proofUrl: "https://filesamples.com/",
      educationalNote:
        "Real camera footage. Compression + focus hunting ≠ diffusion.",
    },
  );

  for (const [id, title] of REAL_SPEECH) {
    rows.push({
      id: `fix-aud-${id}`,
      sortOrder: sort++,
      mediaType: "audio",
      title,
      mediaUrl: `https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_${id}_8k.wav`,
      thumbUrl: null,
      textContent: null,
      isAi: false,
      proofUrl: "https://www.voiptroubleshooter.com/open_speech/",
      educationalNote:
        "Real human speech (Open Speech Repository). Breath noise, mic room, uneven pacing — the messy stuff TTS sandpapers away.",
    });
  }

  return rows;
}

const FIXTURE_ROWS = buildRows();

export function getFixturePack(playDate = playDateCT()): ArtifactReveal[] {
  return FIXTURE_ROWS.map((row) => ({
    ...row,
    playDate,
    analysisBullets: row.educationalNote
      ? row.educationalNote.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 3)
      : [],
  }));
}

export function getPublicFixturePack(playDate = playDateCT()): Artifact[] {
  return getFixturePack(playDate).map(
    ({
      isAi: _isAi,
      educationalNote: _note,
      proofUrl: _proof,
      analysisBullets: _b,
      ...rest
    }) => rest,
  );
}

export function getFixtureReveal(id: string): ArtifactReveal | null {
  return getFixturePack().find((a) => a.id === id) ?? null;
}

export { AI_VIDEOS };
