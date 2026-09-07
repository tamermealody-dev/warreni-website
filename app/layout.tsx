import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo" });

const siteUrl = process.env.APP_URL || "https://warreni.sahebelcode.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "علّمني — بدلًا من المال، بادل وقتك",
    template: "%s | علّمني",
  },
  description:
    "منصة مصرية لتبادل المهارات بالوقت. ساعة منك تساوي ساعة من غيرك — علّم الآخرين ما تعرفه، وتعلّم ما تحتاج إليه.",
  keywords: [
    "علّمني",
    "تبادل مهارات",
    "التعليم عبر الإنترنت",
    "مصر",
    "تبادل وقت",
    "skill exchange",
    "Egypt",
  ],
  applicationName: "علّمني",
  generator: "v0.app",
  authors: [{ name: "علّمني" }],
  formatDetection: { telephone: false },
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      {
        url: "/icon-light-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [{ url: "/apple-icon.png" }],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: siteUrl,
    siteName: "علّمني",
    title: "علّمني — بدلًا من المال، بادل وقتك",
    description:
      "منصة مصرية لتبادل المهارات بالوقت. ساعة منك تساوي ساعة من غيرك.",
    images: [
      { url: "/apple-icon.png", width: 180, height: 180, alt: "علّمني" },
    ],
  },
  twitter: {
    card: "summary",
    title: "علّمني — بدلًا من المال، بادل وقتك",
    description:
      "منصة مصرية لتبادل المهارات بالوقت. ساعة منك تساوي ساعة من غيرك.",
    images: ["/apple-icon.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7fbf9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="bg-background">
      <body className={`${cairo.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  );
}
