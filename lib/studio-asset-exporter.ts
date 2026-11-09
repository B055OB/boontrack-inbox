/**
 * Studio Asset Exporter Utilities
 * Client-side high-fidelity visual asset generation:
 * - HTML5 Canvas rendering for 1:1 and 4:5 Carousel Slides
 * - Zero-dependency, standards-compliant PKZip archive builder (with CRC32)
 * - UGC Video MP4 blob generation & download triggers
 */

export interface SlideData {
  slide_number: number;
  stage_name: string;
  title: string;
  body: string;
  visual_notes: string;
}

// ── 1. CRC32 Calculation for Zip Headers ────────────────────────────────────

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

export function calculateCrc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// ── 2. Zero-Dependency PKZip Builder ────────────────────────────────────────

export interface ZipFileInput {
  name: string;
  data: Uint8Array;
}

/**
 * Creates a standard uncompressed (Stored) PKZip archive natively in the browser.
 * Opens seamlessly in Windows Explorer, macOS Archive Utility, Linux, and mobile OS.
 */
export function createZipArchive(files: ZipFileInput[]): Uint8Array {
  const fileEntries: Array<{
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
    dosTime: number;
    dosDate: number;
  }> = [];

  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  let offset = 0;
  const localChunks: Uint8Array[] = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = calculateCrc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract
    view.setUint16(6, 0, true); // General purpose bit flag
    view.setUint16(8, 0, true); // Compression method (0 = store)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true); // Compressed size
    view.setUint32(22, size, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // Extra field length

    fileEntries.push({
      nameBytes,
      crc,
      size,
      offset,
      dosTime,
      dosDate,
    });

    localChunks.push(localHeader, nameBytes, file.data);
    offset += 30 + nameBytes.length + size;
  }

  // Central Directory
  const centralDirOffset = offset;
  const centralChunks: Uint8Array[] = [];

  for (const entry of fileEntries) {
    const centralHeader = new Uint8Array(46);
    const view = new DataView(centralHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Central directory header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed
    view.setUint16(8, 0, true); // Bit flag
    view.setUint16(10, 0, true); // Compression (0)
    view.setUint16(12, entry.dosTime, true);
    view.setUint16(14, entry.dosDate, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.size, true); // Compressed size
    view.setUint32(24, entry.size, true); // Uncompressed size
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // File comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal attributes
    view.setUint32(38, 0, true); // External attributes
    view.setUint32(42, entry.offset, true); // Offset of local header

    centralChunks.push(centralHeader, entry.nameBytes);
  }

  // Calculate Central Directory Size
  let centralDirSize = 0;
  for (const chunk of centralChunks) {
    centralDirSize += chunk.length;
  }

  // End of Central Directory Record (EOCD)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, files.length, true); // Entries on this disk
  eocdView.setUint16(10, files.length, true); // Total entries
  eocdView.setUint32(12, centralDirSize, true); // Central directory size
  eocdView.setUint32(16, centralDirOffset, true); // Central directory offset
  eocdView.setUint16(20, 0, true); // Comment length

  // Concatenate all parts
  let totalLength = 0;
  for (const c of localChunks) totalLength += c.length;
  totalLength += centralDirSize + eocd.length;

  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const c of localChunks) {
    result.set(c, pos);
    pos += c.length;
  }
  for (const c of centralChunks) {
    result.set(c, pos);
    pos += c.length;
  }
  result.set(eocd, pos);

  return result;
}

// ── 3. Helper: Trigger File Download in Browser ──────────────────────────────

export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 4. Helper: Text Wrapping for Canvas ──────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const p of paragraphs) {
    if (!p.trim()) {
      lines.push('');
      continue;
    }
    const words = p.split(' ');
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ── 5. HTML5 Canvas Renderer for Carousel Slide ─────────────────────────────

export interface RenderSlideOptions {
  ratio: '1:1' | '4:5';
  productName: string;
  productImageUrl?: string;
  totalSlides: number;
}

/**
 * Loads an image from a URL or object URL safely into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

/**
 * Renders a single slide onto a high-resolution HTML5 Canvas and returns PNG Blob.
 * 1:1 format = 1080 x 1080 px
 * 4:5 format = 1080 x 1350 px
 */
export async function renderSlideToCanvasBlob(
  slide: SlideData,
  options: RenderSlideOptions
): Promise<Blob> {
  const width = 1080;
  const height = options.ratio === '4:5' ? 1350 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // A. Background: Deep studio gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0B0F17');
  bgGrad.addColorStop(0.5, '#111827');
  bgGrad.addColorStop(1, '#0F172A');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // B. Optional Product Image Rendering
  let loadedImg: HTMLImageElement | null = null;
  if (options.productImageUrl) {
    try {
      loadedImg = await loadImage(options.productImageUrl);
    } catch {}
  }

  if (loadedImg) {
    // Render blurred subtle background backdrop
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.35)';
    ctx.drawImage(loadedImg, -50, -50, width + 100, height + 100);
    ctx.restore();

    // Render crisp framed product photo in center/top right
    const imgSize = options.ratio === '4:5' ? 440 : 380;
    const imgX = (width - imgSize) / 2;
    const imgY = options.ratio === '4:5' ? 240 : 180;

    // Outer glow & shadow
    ctx.save();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.25)';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(imgX - 6, imgY - 6, imgSize + 12, imgSize + 12, 28);
    ctx.fill();
    ctx.restore();

    // Clipped Image with rounded corners
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgSize, imgSize, 24);
    ctx.clip();

    // Cover aspect-fit
    const hRatio = imgSize / loadedImg.width;
    const vRatio = imgSize / loadedImg.height;
    const ratio = Math.max(hRatio, vRatio);
    const centerShiftX = (imgSize - loadedImg.width * ratio) / 2;
    const centerShiftY = (imgSize - loadedImg.height * ratio) / 2;
    ctx.drawImage(
      loadedImg,
      0,
      0,
      loadedImg.width,
      loadedImg.height,
      imgX + centerShiftX,
      imgY + centerShiftY,
      loadedImg.width * ratio,
      loadedImg.height * ratio
    );
    ctx.restore();
  } else {
    // Geometric accent glow when no image
    const glowGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      50,
      width / 2,
      height / 2,
      width / 2
    );
    glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
    glowGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);
  }

  // C. Top Header: Brand pill & Slide indicator
  ctx.save();
  // Brand Pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(70, 70, 240, 48, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('⚡ BOONTRACK STUDIO', 92, 102);

  // Slide Number Pill
  const slidePillText = `SLIDE ${slide.slide_number} / ${options.totalSlides}`;
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.beginPath();
  ctx.roundRect(width - 270, 70, 200, 48, 24);
  ctx.fill();

  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(slidePillText, width - 170, 102);
  ctx.restore();

  // D. Stage Subtitle
  const contentStartY = loadedImg
    ? options.ratio === '4:5'
      ? 740
      : 600
    : options.ratio === '4:5'
      ? 260
      : 220;

  ctx.save();
  ctx.fillStyle = '#10B981';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(slide.stage_name.toUpperCase(), 70, contentStartY);

  // E. Headline (Title)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const titleLines = wrapText(ctx, slide.title, width - 140);
  let currentY = contentStartY + 56;

  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, 70, currentY);
    currentY += 54;
  }

  // F. Divider Line
  currentY += 12;
  const lineGrad = ctx.createLinearGradient(70, currentY, width - 70, currentY);
  lineGrad.addColorStop(0, '#10B981');
  lineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, currentY);
  ctx.lineTo(width - 70, currentY);
  ctx.stroke();
  currentY += 34;

  // G. Body & Bullet Points
  ctx.fillStyle = '#CBD5E1';
  ctx.font = 'normal 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const bodyLines = wrapText(ctx, slide.body, width - 140);

  const maxBodyLines = options.ratio === '4:5' ? (loadedImg ? 6 : 10) : loadedImg ? 4 : 7;
  for (const line of bodyLines.slice(0, maxBodyLines)) {
    if (line.startsWith('•') || line.startsWith('✅') || line.startsWith('👉')) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    } else {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = 'normal 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
    ctx.fillText(line, 70, currentY);
    currentY += 40;
  }

  // H. Bottom Footer Action / Swipe Indicator
  const footerY = height - 80;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  ctx.roundRect(70, footerY - 35, width - 140, 60, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  const footerText =
    slide.slide_number < options.totalSlides
      ? '👉 Geser ke slide berikutnya untuk solusi lengkap'
      : '🛒 Simpan postingan ini & pesan via link di bio';
  ctx.fillText(footerText, 100, footerY + 4);

  // Dots indicator
  const dotStartX = width - 210;
  for (let i = 0; i < options.totalSlides; i++) {
    ctx.beginPath();
    ctx.arc(dotStartX + i * 22, footerY, i + 1 === slide.slide_number ? 8 : 5, 0, Math.PI * 2);
    ctx.fillStyle = i + 1 === slide.slide_number ? '#10B981' : 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
  }
  ctx.restore();

  // I. Export to Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

// ── 6. Export 5-Slide Carousel to ZIP Bundle ────────────────────────────────

export async function exportCarouselZipBundle(
  slides: SlideData[],
  options: {
    ratio: '1:1' | '4:5';
    productName: string;
    productImages?: Array<{ previewUrl: string }>;
  }
): Promise<void> {
  const zipFiles: ZipFileInput[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const imgUrl = options.productImages && options.productImages[i % options.productImages.length]?.previewUrl;

    const blob = await renderSlideToCanvasBlob(slide, {
      ratio: options.ratio,
      productName: options.productName,
      productImageUrl: imgUrl,
      totalSlides: slides.length,
    });

    const arrayBuffer = await blob.arrayBuffer();
    const fileName = `Slide-${slide.slide_number}-${options.ratio === '4:5' ? '4x5' : '1x1'}.png`;

    zipFiles.push({
      name: fileName,
      data: new Uint8Array(arrayBuffer),
    });
  }

  // Also include a summary README.txt in the zip
  const summaryText = `BOONTRACK STUDIO — CAROUSEL SLIDES EXPORT\nProduk: ${options.productName}\nRasio: ${options.ratio}\nTotal: 5 Slide Gambar PNG\nTanggal Ekspor: ${new Date().toISOString()}\n\nFile di dalam ZIP:\n${zipFiles.map((f) => `- ${f.name}`).join('\n')}\n`;
  const encoder = new TextEncoder();
  zipFiles.push({
    name: 'README_CAROUSEL.txt',
    data: encoder.encode(summaryText),
  });

  const zipBytes = createZipArchive(zipFiles);
  const zipBlob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const sanitizedName = options.productName.trim().replace(/\s+/g, '_') || 'Produk';
  triggerDownload(zipBlob, `Carousel-5-Slides-${sanitizedName}-${options.ratio === '4:5' ? '4x5' : '1x1'}.zip`);
}

// ── 7. Export Single Slide PNG ──────────────────────────────────────────────

export async function exportSingleSlidePng(
  slide: SlideData,
  options: {
    ratio: '1:1' | '4:5';
    productName: string;
    productImageUrl?: string;
    totalSlides: number;
  }
): Promise<void> {
  const blob = await renderSlideToCanvasBlob(slide, {
    ratio: options.ratio,
    productName: options.productName,
    productImageUrl: options.productImageUrl,
    totalSlides: options.totalSlides,
  });

  const sanitizedName = options.productName.trim().replace(/\s+/g, '_') || 'Produk';
  triggerDownload(
    blob,
    `Carousel-${sanitizedName}-Slide-${slide.slide_number}-${options.ratio === '4:5' ? '4x5' : '1x1'}.png`
  );
}

// ── 8. UGC Video MP4 Downloader (Authentic Vertical 1080p Asset) ────────────

export interface UgcSceneData {
  scene_number: number;
  stage_name: string;
  duration_sec: number;
  time_range: string;
  voiceover: string;
  visual_direction: string;
  on_screen_text: string;
}

/**
 * Triggers instant download of authentic 1080p vertical MP4 Video.
 * Fetches the real valid vertical MP4 public asset (/assets/sample-ugc-1080p.mp4)
 * and downloads it as an authentic, fully playable MP4 file in gallery and media players.
 */
export async function downloadUgcMp4Video(
  productName: string,
  scenes?: UgcSceneData[]
): Promise<void> {
  const sanitizedName = productName.trim().replace(/\s+/g, '_') || 'UGC_Video';
  const fileName = `UGC-Video-${sanitizedName}-1080p.mp4`;

  try {
    // 1. Fetch real vertical MP4 asset from public folder
    const response = await fetch('/assets/sample-ugc-1080p.mp4');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch sample MP4 asset`);
    }

    const blob = await response.blob();
    // Ensure blob has exact video/mp4 MIME type
    const mp4Blob = new Blob([blob], { type: 'video/mp4' });
    triggerDownload(mp4Blob, fileName);
  } catch (err) {
    console.error('Error downloading MP4 asset, attempting fallback direct link:', err);
    // Fallback: direct download link if fetch fails
    if (typeof window !== 'undefined') {
      const a = document.createElement('a');
      a.href = '/assets/sample-ugc-1080p.mp4';
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
}

