const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generateShopIcon() {
  const sourcePath = 'D:/Downloads/boontrackshoplogo.jpg';
  const targetPath = path.join(__dirname, '../public/icon-shop.png');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source file not found at: ${sourcePath}`);
    process.exit(1);
  }

  const { data, info } = await sharp(sourcePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // Background color around corners: approx RGB(38.9, 46.8, 58.2)
  const bgR = 38.9, bgG = 46.8, bgB = 58.2;
  const outBuf = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];

    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    // Alpha smoothly maps from 0 to 1 between dist 18 and 72
    let a = (dist - 18.0) / (72.0 - 18.0);
    if (a < 0) a = 0;
    if (a > 1) a = 1;

    let cleanR = r;
    let cleanG = g;
    let cleanB = b;

    // Decontaminate background color from anti-aliased edge pixels
    if (a > 0 && a < 1) {
      cleanR = Math.min(255, Math.max(0, (r - (1 - a) * bgR) / a));
      cleanG = Math.min(255, Math.max(0, (g - (1 - a) * bgG) / a));
      cleanB = Math.min(255, Math.max(0, (b - (1 - a) * bgB) / a));
    }

    outBuf[i * 4] = Math.round(cleanR);
    outBuf[i * 4 + 1] = Math.round(cleanG);
    outBuf[i * 4 + 2] = Math.round(cleanB);
    outBuf[i * 4 + 3] = Math.round(a * 255);
  }

  // Crop square around center icon (center is 1023.5, 1023.5)
  const cropLeft = 370;
  const cropTop = 370;
  const cropSize = 1306;

  await sharp(outBuf, { raw: { width, height, channels: 4 } })
    .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(targetPath);

  console.log(`Pristine transparent shop icon saved to: ${targetPath}`);
}

generateShopIcon().catch((err) => {
  console.error(err);
  process.exit(1);
});
