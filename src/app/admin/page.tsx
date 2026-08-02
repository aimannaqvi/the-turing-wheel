import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { isAdminSurfaceEnabled } from "@/lib/adminGate";

export const metadata = {
  title: "Admin · The Turing Wheel",
};

export default function AdminPage() {
  if (!isAdminSurfaceEnabled()) notFound();
  return <AdminPanel />;
}
