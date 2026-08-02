import { NextResponse } from "next/server";
import { listLibrary } from "@/lib/artifacts";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { MediaType } from "@/lib/types";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get("mediaType") as MediaType | null;
  const items = await listLibrary({
    status: "kept",
    mediaType: mediaType || undefined,
  });
  return NextResponse.json({ items });
}
