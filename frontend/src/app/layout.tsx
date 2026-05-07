import type { Metadata, Viewport } from "next";

import { BackToTop } from "@/components/site/BackToTop";

import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pollutionanalyst.com";

const SITE_DESCRIPTION =
  "Pollution trend intelligence built from federal public data — facility releases, drinking-water violations, and equity overlays at county and entity scale.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Pollution Analyst — Pollution Trend Intelligence",
  description: SITE_DESCRIPTION,
  applicationName: "Pollution Analyst",
  openGraph: {
    type: "website",
    siteName: "Pollution Analyst",
    locale: "en_US",
    title: "Pollution Analyst — Pollution Trend Intelligence",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pollution Analyst — Pollution Trend Intelligence",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const GTM_ID = "GTM-N2JWZZ7L";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <BackToTop />
      </body>
    </html>
  );
}
