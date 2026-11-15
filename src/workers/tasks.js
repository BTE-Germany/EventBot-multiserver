// CPU-heavy work, executed inside pool workers. Each task returns
// { result, transfer } so large buffers move between threads without copying.
const sharp = require("sharp");

// Long edge in pixels; larger screenshots are scaled down
const MAX_IMAGE_SIZE = 2560;
const WEBP_QUALITY = 80;

// sharp has its own thread pool per process; inside our workers one is enough
sharp.concurrency(1);

const asBuffer = (data) => Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength ?? data.length);

function transferable(buffer) {
  // Copy into an exclusively owned ArrayBuffer so it can be transferred
  const out = new Uint8Array(buffer.length);
  out.set(buffer);
  return { result: out, transfer: [out.buffer] };
}

module.exports = {
  // Re-encodes an uploaded screenshot as compressed WebP, keeping animations
  async convertImage({ data }) {
    const output = await sharp(asBuffer(data), { animated: true })
      .rotate()
      .resize(MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer();
    return transferable(output);
  },

  // Rasterizes an SVG card to PNG
  async renderSvg({ svg, scale = 1 }) {
    const output = await sharp(Buffer.from(svg), { density: 72 * scale }).png({ compressionLevel: 8 }).toBuffer();
    return transferable(output);
  },

  // Used by tests and the dashboard health check
  async echo(payload) {
    return { result: payload };
  },
  async sleep({ ms }) {
    await new Promise((r) => setTimeout(r, ms));
    return { result: ms };
  },
  async fail({ message }) {
    throw new Error(message);
  },
  async crash() {
    process.exit(3);
  },
};
