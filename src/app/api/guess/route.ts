import { NextResponse } from "next/server";
import { revealArtifact } from "@/lib/artifacts";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    artifactId?: string;
    guessedAi?: boolean;
    anonymousId?: string;
  };

  if (!body.artifactId || typeof body.guessedAi !== "boolean") {
    return NextResponse.json(
      { error: "artifactId and guessedAi are required" },
      { status: 400 },
    );
  }

  const result = await revealArtifact(
    body.artifactId,
    body.guessedAi,
    body.anonymousId,
  );

  if (!result) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
