// Node smoke test for the PDF / PPTX builders (mirrors src/ui.ts logic).
// Usage: node scripts/smoke.mjs <outDir>
import { PDFDocument } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.';
mkdirSync(outDir, { recursive: true });

function png(w, h, [r, g, b]) {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * 3;
      const stripe = ((x >> 5) + (y >> 5)) & 1;
      raw[o] = stripe ? r : r >> 1; raw[o + 1] = stripe ? g : g >> 1; raw[o + 2] = stripe ? b : b >> 1;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

function imageSize(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

const scale = 2;
const pages = [
  { name: 'Cover', w: 1920, h: 1080, c: [13, 153, 255] },
  { name: 'Agenda', w: 1920, h: 1080, c: [20, 174, 92] },
  { name: 'Mobile', w: 390, h: 844, c: [242, 72, 34] },
];
const imgs = pages.map((p) => ({ name: p.name, bytes: png(p.w * scale, p.h * scale, p.c) }));

// ---- PDF
const PX_TO_PT = 72 / 96;
const pdf = await PDFDocument.create();
pdf.setTitle('Smoke Deck'); pdf.setProducer('Figma2safePDF');
for (const img of imgs) {
  const e = await pdf.embedPng(img.bytes);
  const w = (e.width / scale) * PX_TO_PT, h = (e.height / scale) * PX_TO_PT;
  pdf.addPage([w, h]).drawImage(e, { x: 0, y: 0, width: w, height: h });
}
const pdfBytes = await pdf.save();
writeFileSync(join(outDir, 'smoke.pdf'), pdfBytes);
const back = await PDFDocument.load(pdfBytes);
console.log('PDF pages:', back.getPageCount(), back.getPages().map((p) => { const s = p.getSize(); return `${s.width.toFixed(0)}x${s.height.toFixed(0)}pt`; }).join(' '), `${(pdfBytes.byteLength / 1024).toFixed(0)}KB`);

// ---- PPTX
const LONG = 13.333;
const first = imageSize(imgs[0].bytes);
const ar = first.w / first.h;
const W = ar >= 1 ? LONG : +(LONG * ar).toFixed(3), H = ar >= 1 ? +(LONG / ar).toFixed(3) : LONG;
const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'FIGMA', width: W, height: H });
pptx.layout = 'FIGMA';
pptx.title = 'Smoke Deck';
for (const img of imgs) {
  const { w, h } = imageSize(img.bytes);
  const a = w / h;
  let dw = W, dh = W / a;
  if (dh > H) { dh = H; dw = H * a; }
  pptx.addSlide().addImage({ data: `image/png;base64,${Buffer.from(img.bytes).toString('base64')}`, x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh });
}
const buf = await pptx.write({ outputType: 'nodebuffer' });
writeFileSync(join(outDir, 'smoke.pptx'), buf);
console.log('PPTX layout:', `${W}x${H}in`, `${(buf.length / 1024).toFixed(0)}KB`);
