// lib/splash.ts
import splash from "@/lib/splash-screens.json";

export type SplashScreen = { width: number; height: number; ratio: number };

export const SPLASH_SCREENS: SplashScreen[] = splash.screens;

/**
 * Width of the mark on the loading screen for a viewport width (CSS px):
 * 42% of the width like the artwork, between 140 and 420 px. The CSS in
 * components/loading-screen.tsx and the startup images use this same rule.
 */
export function logoWidthFor(viewportWidth: number): number {
  return Math.min(420, Math.max(140, viewportWidth * 0.42));
}

export const splashFile = ({ width, height, ratio }: SplashScreen) =>
  `/splash/splash-${width * ratio}x${height * ratio}.png`;

export const splashMedia = ({ width, height, ratio }: SplashScreen) =>
  `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
