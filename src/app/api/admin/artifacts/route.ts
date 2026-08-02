import { NextResponse } from "next/server";
import { getAdminInventory } from "@/lib/artifacts";

export async function GET() {
  const inventory = await getAdminInventory();
  return NextResponse.json(inventory);
}
