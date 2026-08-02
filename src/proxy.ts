import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminSurfaceEnabled } from "@/lib/adminGate";

export function proxy(request: NextRequest) {
  if (isAdminSurfaceEnabled()) {
    return NextResponse.next();
  }

  // Opaque 404 — don't advertise that admin exists
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
