import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ffmpeg-static",
    "msedge-tts",
    "@xenova/transformers",
    "onnxruntime-node",
  ],
};

export default nextConfig;
