import type { Metadata, Viewport } from "next";

import { BackToTop } from "@/components/site/BackToTop";

import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pollutionanalyst.ai";

const SITE_DESCRIPTION =
  "Pollution trend intelligence built from federal public data — facility releases, drinking-water violations, and equity overlays at county and entity scale.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Pollution Analyst.ai — pollution trend intelligence",
  description: SITE_DESCRIPTION,
  applicationName: "Pollution Analyst.ai",
  openGraph: {
    type: "website",
    siteName: "Pollution Analyst.ai",
    locale: "en_US",
    title: "Pollution Analyst.ai — pollution trend intelligence",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pollution Analyst.ai — pollution trend intelligence",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BackToTop />
      </body>
    </html>
  );
}
