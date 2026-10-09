// Generates the PWA icons in public/icons from public/icon.svg.
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
