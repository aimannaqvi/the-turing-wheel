/**
 * Admin UI + /api/admin/* are for local curation only.
 * Production ships the game; flip ADMIN_ENABLED=true to temporarily expose admin.
 */
export function isAdminSurfaceEnabled(): boolean {
  if (process.env.ADMIN_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production";
}
