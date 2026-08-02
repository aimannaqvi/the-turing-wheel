import { NextResponse } from "next/server";
import { listLibrary } from "@/lib/artifacts";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const items = await listLibrary({ status: "intake" });
  return NextResponse.json({ items, remaining: items.length });
}
