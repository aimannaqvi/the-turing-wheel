import { writeFileSync } from "node:fs";

const AI_VIDEOS = [
  ["sd1", "Seedance 1", "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini.mp4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/1-mini-thumbnail.webp"],
  ["sd2", "Seedance 2", "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini.mp4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/2-mini-thumbnail.webp"],
  ["sd3", "Seedance 3", "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini.mp4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/3-mini-thumbnail.webp"],
  ["sd4", "Seedance 4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini.mp4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/4-mini-thumbnail.webp"],
  ["sd5", "Seedance 5", "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini.mp4", "https://static.higgsfield.ai/seedance-2.0-v2/examples/5-mini-thumbnail.webp"],
  ["hf1", "Higgsfield cinema", "https://static.higgsfield.ai/ai-video-v2/01-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/01-mini-thumbnail.webp"],
  ["hf2", "Higgsfield 02", "https://static.higgsfield.ai/ai-video-v2/02-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/02-mini-thumbnail.webp"],
  ["hf3", "Higgsfield 03", "https://static.higgsfield.ai/ai-video-v2/03-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/03-mini-thumbnail.webp"],
  ["hf-e1", "Higgsfield gen 1", "https://static.higgsfield.ai/ai-video-v2/example-1-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/example-1-mini-thumbnail.webp"],
  ["hf-e2", "Higgsfield gen 2", "https://static.higgsfield.ai/ai-video-v2/example-2-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/example-2-mini-thumbnail.webp"],
  ["hf-e3", "Higgsfield gen 3", "https://static.higgsfield.ai/ai-video-v2/example-3-mini.mp4", "https://static.higgsfield.ai/ai-video-v2/example-3-mini-thumbnail.webp"],
];

const REAL_IMAGES = [
  ["Alpine ridge", "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&q=85", "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=480&q=70", "Real photo. Atmospheric haze + optical DOF."],
  ["Neon alley", "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1400&q=85", "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=480&q=70", "Real night photography — messy speculars generators oversmooth."],
  ["Studio portrait", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1400&q=85", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=480&q=70", "Real portrait that trips people — check hair edges / catchlights."],
  ["Still life", "https://images.unsplash.com/photo-1490312278390-ab6426f0bfa2?w=1400&q=85", "https://images.unsplash.com/photo-1490312278390-ab6426f0bfa2?w=480&q=70", "Real still-life. Micro-scratches on glaze."],
  ["Crosswalk", "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=85", "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=480&q=70", "Real crowd scene — limb intersections still expose gens."],
];

const SPEECH = ["0010","0011","0012","0013","0014","0015","0016","0017","0018","0019","0030","0040"];

function esc(s) {
  if (s == null) return "null";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function row(sort, type, title, media, thumb, isAi, proof, note) {
  return `(
  (timezone('America/Chicago', now()))::date,
  ${sort},
  ${esc(type)},
  ${esc(title)},
  ${esc(media)},
  ${esc(thumb)},
  null,
  ${isAi},
  ${esc(proof)},
  ${esc(note)}
)`;
}

const values = [];
let sort = 1;

for (const [title, media, thumb, note] of REAL_IMAGES) {
  values.push(row(sort++, "image", title, media, thumb, false, null, note));
}

for (const [key, title, , thumb] of AI_VIDEOS) {
  values.push(
    row(
      sort++,
      "image",
      `${title} frame`,
      thumb,
      thumb,
      true,
      "https://higgsfield.ai/seedance/2.0",
      `AI still from ${title} video thumb (Higgsfield/Seedance CDN).`,
    ),
  );
}

for (const [, title, media, thumb] of AI_VIDEOS) {
  values.push(
    row(
      sort++,
      "video",
      title,
      media,
      thumb,
      true,
      "https://higgsfield.ai/",
      `AI video — ${title} (Higgsfield/Seedance public CDN).`,
    ),
  );
}

values.push(
  row(
    sort++,
    "video",
    "Flower",
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=480&q=70",
    false,
    "https://developer.mozilla.org/",
    "Real CC0 clip. Soft organic motion — easy to mistake for gen at a glance.",
  ),
  row(
    sort++,
    "video",
    "Sample plate",
    "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
    "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=480&q=70",
    false,
    "https://filesamples.com/",
    "Real camera footage. Compression + focus hunting ≠ diffusion.",
  ),
);

for (const id of SPEECH) {
  values.push(
    row(
      sort++,
      "audio",
      `Open speech ${id}`,
      `https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_${id}_8k.wav`,
      null,
      false,
      "https://www.voiptroubleshooter.com/open_speech/",
      "Real human speech (Open Speech Repository). Breath noise, mic room, uneven pacing.",
    ),
  );
}

const sql = `delete from public.user_guesses
where artifact_id in (
  select id from public.daily_artifacts
  where play_date = (timezone('America/Chicago', now()))::date
);

delete from public.daily_artifacts
where play_date = (timezone('America/Chicago', now()))::date;

insert into public.daily_artifacts (
  play_date, sort_order, media_type, title, media_url, thumb_url, text_content,
  is_ai, proof_url, educational_note
) values
${values.join(",\n")};
`;

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(`wrote ${values.length} rows`);
