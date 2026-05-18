import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIR = "public/vision_express/common";
const MAX_WIDTH = 1920;
const QUALITY = 90;

const files = await readdir(DIR);
const imgs = files.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

console.log(`Converting ${imgs.length} images → WebP @ max ${MAX_WIDTH}px / q${QUALITY}\n`);

let totalIn = 0;
let totalOut = 0;
let skipped = 0;

for (const file of imgs) {
  const inPath = join(DIR, file);
  const outPath = join(DIR, file.replace(/\.(png|jpg|jpeg)$/i, ".webp"));
  const inSize = (await stat(inPath)).size;

  // Skip if a webp with this base name already exists and is fresh.
  try {
    const existing = await stat(outPath);
    if (existing.mtimeMs > (await stat(inPath)).mtimeMs) {
      skipped++;
      continue;
    }
  } catch {
    // doesn't exist — convert
  }

  await sharp(inPath)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);

  const outSize = (await stat(outPath)).size;
  totalIn += inSize;
  totalOut += outSize;
  const reduction = ((1 - outSize / inSize) * 100).toFixed(1);
  console.log(`  ${file} → ${(inSize / 1024 / 1024).toFixed(2)}MB → ${(outSize / 1024).toFixed(0)}KB (-${reduction}%)`);
}

console.log(`\nConverted: ${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024 / 1024).toFixed(2)}MB (-${((1 - totalOut / totalIn) * 100).toFixed(1)}%)`);
if (skipped > 0) console.log(`Skipped (webp newer): ${skipped}`);
