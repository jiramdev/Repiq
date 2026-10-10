// app/layout.tsx
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import { BottomDock } from "@/components/bottom-dock";
import { PwaManager } from "@/components/pwa";
import { WorkoutLockGuard } from "@/components/workout-lock";
import { THEME_COLOR } from "@/lib/theme";
import { SPLASH_SCREENS, splashFile, splashMedia } from "@/lib/splash";
import { str } from "@/lib/strings";
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
  title: str.app.name,
  description: str.app.description,
  applicationName: "Repiq",
  // The favicon comes from app/icon.svg and the manifest from app/manifest.ts.
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: str.app.name,
    // iOS shows these while the installed app starts; they match the loading
    // screen (scripts/generate-icons.mjs renders them).
    startupImage: SPLASH_SCREENS.map((screen) => ({ url: splashFile(screen), media: splashMedia(screen) })),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled for accessibility; inputs use 16px text so iOS
  // doesn't auto-zoom when they're focused.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <PwaManager />
        {/* Reads the URL, so it streams in after the static shell. */}
        <Suspense fallback={null}>
          <WorkoutLockGuard />
        </Suspense>
      </body>
    </html>
  );
}
