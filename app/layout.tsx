import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Interview Integrity Studio | AI-Powered Interview Proctoring Dashboard",
    template: "%s | Interview Integrity Studio",
  },
  description:
    "Interview Integrity Studio is an AI-powered interview proctoring dashboard built with Next.js, TypeScript, and Tailwind CSS for live candidate monitoring, focus tracking, suspicious object detection, and audit-ready reporting.",
  keywords: [
    "AI interview proctoring",
    "interview monitoring system",
    "candidate integrity dashboard",
    "online interview proctoring",
    "Next.js TypeScript project",
    "focus tracking app",
    "object detection interview app",
    "recruitment tech dashboard",
  ],
  applicationName: "Interview Integrity Studio",
  authors: [{ name: "Verma" }],
  creator: "Verma",
  publisher: "Verma",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Interview Integrity Studio",
    description:
      "AI-powered interview monitoring with candidate presence checks, suspicious object detection, focus tracking, and exportable audit reports.",
    url: "/",
    siteName: "Interview Integrity Studio",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Interview Integrity Studio",
    description:
      "Modern interview proctoring dashboard with live monitoring, risk scoring, and backend audit reporting.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${spaceGrotesk.variable} bg-ink text-slate-50 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
