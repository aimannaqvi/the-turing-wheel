import type { Metadata } from "next";
import { AboutPage } from "@/components/about/AboutPage";

export const metadata: Metadata = {
  title: "About · The Turing Wheel",
  description:
    "A daily practice in AI literacy — look closer, listen longer, leave a little less sure.",
};

export default function About() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AboutPage />
    </div>
  );
}
