import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" overflow="visible">
  <path d="M10 10c0-4 4-6 7-3s5 6 8 6 6-2 6-5-3-6-6-5-5 4-8 6-5 5-7 4-4-2-4-5 3-5 6-5"
        fill="none" stroke="#fff" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const buf = await sharp(Buffer.from(svg), { density: 1000 })
  .flatten({ background: { r: 0, g: 0, b: 0 } })
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data, info } = buf;
const { width, height, channels } = info;
let minX = width, maxX = 0, minY = height, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const bright = data[i] + data[i + 1] + data[i + 2];
    if (bright > 30) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
// Convert back to SVG-unit coordinates (width is 40 units, stretched to `width` px).
const scaleX = 40 / width;
const scaleY = 20 / height;
console.log({
  pixelBounds: { minX, maxX, minY, maxY },
  svgBounds: {
    minX: (minX * scaleX).toFixed(2),
    maxX: (maxX * scaleX).toFixed(2),
    minY: (minY * scaleY).toFixed(2),
    maxY: (maxY * scaleY).toFixed(2),
    width: ((maxX - minX) * scaleX).toFixed(2),
    height: ((maxY - minY) * scaleY).toFixed(2),
  },
});
