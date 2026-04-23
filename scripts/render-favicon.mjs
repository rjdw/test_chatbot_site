#!/usr/bin/env node
import sharp from "sharp";
import { readFile, writeFile } from "fs/promises";

const svg = await readFile("src/public/favicon.svg");
for (const size of [32, 180, 512]) {
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(`src/public/favicon-${size}.png`, buf);
  console.log(`wrote favicon-${size}.png (${buf.length} bytes)`);
}
await writeFile(
  "src/public/apple-touch-icon.png",
  await sharp(svg, { density: 384 }).resize(180, 180).png().toBuffer()
);
console.log("wrote apple-touch-icon.png");
