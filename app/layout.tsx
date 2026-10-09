import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import { BottomDock } from "@/components/bottom-dock";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

export const metadata: Metadata = {
  title: "repiq",
  description: "Minimalist workout tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "repiq",
  },
};

export const viewport: Viewport = {
  themeColor: "#baa3d0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${anton.variable} h-full bg-[#baa3d0] overscroll-none`}
    >
      <body className="h-full min-h-[100dvh] bg-[#baa3d0] antialiased text-white selection:bg-[#baa3d0] selection:text-[#141416] overscroll-none">
        {children}
        <Suspense fallback={null}>
          <BottomDock />
        </Suspense>
      </body>
    </html>
  );
}