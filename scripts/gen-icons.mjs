import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const jobs = [
  { svg: "public/icon.svg", out: "icons/icon-192.png", size: 192 },
  { svg: "public/icon.svg", out: "icons/icon-512.png", size: 512 },
  { svg: "public/icon.svg", out: "icons/apple-touch-icon.png", size: 180 },
  { svg: "public/icon-maskable.svg", out: "icons/maskable-512.png", size: 512 },
  { svg: "public/icon.svg", out: "favicon-32.png", size: 32 },
];

for (const j of jobs) {
  await sharp(resolve(root, j.svg))
    .resize(j.size, j.size)
    .png()
    .toFile(resolve(root, "public", j.out));
  console.log("wrote public/" + j.out);
}
