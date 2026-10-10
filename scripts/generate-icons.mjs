// Generates the PWA icons in public/icons from public/icon.svg and the iOS startup images in public/splash from public/icons/logo.svg.
// Run with: npm run icons   (requires the `sharp` dev dependency)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");
const glyph = source.match(/<path[^>]*\/>/)?.[0];
if (!glyph) throw new Error("Could not find the glyph <path> in public/icon.svg");

const LAVENDER = "#BAA3D0";

// Full-bleed square with the glyph scaled into the 80% maskable safe zone.
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" fill="${LAVENDER}"/>` +
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph}</g></svg>`;

// Monochrome notification badge: white glyph on transparent.
const badge =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<g transform="translate(256 256) scale(1.15) translate(-256 -256)">${glyph.replace(/fill="[^"]*"/, 'fill="#FFFFFF"')}</g></svg>`;

const outDir = new URL("../public/icons/", import.meta.url);
await mkdir(outDir, { recursive: true });

const render = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const outputs = [
  ["icons/icon-192.png", source, 192],
  ["icons/icon-512.png", source, 512],
  ["icons/maskable-192.png", fullBleed(0.8), 192],
  ["icons/maskable-512.png", fullBleed(0.8), 512],
  ["icons/badge-96.png", badge, 96],
  // iOS applies its own rounded mask, so give it a full-bleed square.
  ["apple-touch-icon.png", fullBleed(0.85), 180],
];

for (const [file, svg, size] of outputs) {
  await writeFile(new URL(`../public/${file}`, import.meta.url), await render(svg, size));
  console.log(`wrote public/${file} (${size}x${size})`);
}

// iOS startup images: the loading screen (components/loading-screen.tsx) as a
// PNG per device size, so the installed app opens straight into it.
const splashConfig = JSON.parse(await readFile(new URL("../lib/splash-screens.json", import.meta.url), "utf8"));
const logo = await readFile(new URL("../public/icons/logo.svg", import.meta.url), "utf8");
const logoPath = logo.match(/<path[^>]*\/>/)?.[0];
const viewBox = logo.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
if (!logoPath || !viewBox) throw new Error("Could not read public/icons/logo.svg");
const [vx, vy, vw, vh] = viewBox;
// Keep in sync with THEME_COLOR in lib/theme.ts and logoWidthFor() in lib/splash.ts.
const SPLASH_BACKGROUND = "#baa3d1";
const logoWidthFor = (cssWidth) => Math.min(420, Math.max(140, cssWidth * 0.42));

const splashDir = new URL("../public/splash/", import.meta.url);
await mkdir(splashDir, { recursive: true });
for (const { width, height, ratio } of splashConfig.screens) {
  const w = width * ratio;
  const h = height * ratio;
  const markW = logoWidthFor(width) * ratio;
  const scale = markW / vw;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${SPLASH_BACKGROUND}"/>` +
    `<g transform="translate(${w / 2} ${h / 2}) scale(${scale}) translate(${-(vx + vw / 2)} ${-(vy + vh / 2)})">${logoPath}</g></svg>`;
  const file = `splash-${w}x${h}.png`;
  await writeFile(new URL(file, splashDir), await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer());
  console.log(`wrote public/splash/${file}`);
}
