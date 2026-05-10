/** Downscale sticker photos before Gemini vision — full camera resolution often exceeds inline limits. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export async function prepareStickerImageForExtraction(file: File): Promise<{ base64: string; mimeType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image.'));
      img.src = url;
    });

    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!w || !h) throw new Error('Invalid image size.');

    const maxSide = Math.max(w, h);
    const scale = maxSide > MAX_EDGE_PX ? MAX_EDGE_PX / maxSide : 1;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available.');
    ctx.drawImage(img, 0, 0, cw, ch);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return { base64, mimeType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
