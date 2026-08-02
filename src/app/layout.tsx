import type { Metadata } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import Script from "next/script";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import "./globals.css";

/** Editorial sans — Franklin Gothic cousin, less “AI starter kit” than DM Sans */
const libreFranklin = Libre_Franklin({
  variable: "--font-sans-face",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Newsy serif — denser, less bridal than Playfair */
const newsreader = Newsreader({
  variable: "--font-serif-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Turing Wheel",
  description:
    "A daily puzzle: can you tell Real from AI? Minimalist media literacy for the feed era.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const themeBootScript = `(function(){try{var t=localStorage.getItem('ttw-theme');if(t==='dusk')document.documentElement.dataset.theme='dusk';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${libreFranklin.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
