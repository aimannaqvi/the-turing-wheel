import { NextResponse } from "next/server";
import { getTodaysPack } from "@/lib/artifacts";

export async function GET() {
  const pack = await getTodaysPack();
  return NextResponse.json(pack);
}
