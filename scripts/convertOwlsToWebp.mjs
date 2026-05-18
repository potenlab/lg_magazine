import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const OWL_DIR = "public/vision_express/v3/owl";
const TARGET_WIDTH = 1024;
const QUALITY = 85;

const files = await readdir(OWL_DIR);
const pngs = files.filter((f) => f.endsWith(".png"));

console.log(`Converting ${pngs.length} owl PNG → WebP @ ${TARGET_WIDTH}px / q${QUALITY}`);

let totalIn = 0;
let totalOut = 0;

for (const file of pngs) {
  const inPath = join(OWL_DIR, file);
  const outPath = join(OWL_DIR, file.replace(/\.png$/, ".webp"));
  const inSize = (await stat(inPath)).size;

  await sharp(inPath)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);

  const outSize = (await stat(outPath)).size;
  totalIn += inSize;
  totalOut += outSize;
  const reduction = ((1 - outSize / inSize) * 100).toFixed(1);
  console.log(`  ${file} → ${file.replace(".png", ".webp")}: ${(inSize / 1024 / 1024).toFixed(1)}MB → ${(outSize / 1024).toFixed(0)}KB (-${reduction}%)`);
}

console.log(`\nTotal: ${(totalIn / 1024 / 1024).toFixed(1)}MB → ${(totalOut / 1024 / 1024).toFixed(1)}MB (-${((1 - totalOut / totalIn) * 100).toFixed(1)}%)`);
