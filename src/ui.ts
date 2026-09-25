// UI iframe. Receives raw PNG/JPG bytes from the main thread, assembles an
// image-only PDF (pdf-lib) or PPTX (PptxGenJS) and triggers the download.
import { PDFDocument } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';

type ImageFormat = 'PNG' | 'JPG';
type Order = 'position' | 'layers' | 'number';
type Output = 'pdf' | 'pptx';
interface Settings { scale: number; format: ImageFormat; order: Order; output: Output }
interface Item { id: string; name: string; type: string; width: number; height: number }
interface Img { bytes: Uint8Array; name: string }
interface Job { images: (Uint8Array | null)[]; names: string[]; scale: number; format: ImageFormat; output: Output; skipped: string[] }

const PX_TO_PT = 72 / 96;
const SLIDE_LONG_EDGE_IN = 13.333; // PowerPoint 16:9 is 13.333 × 7.5 in
const SCALE_PRESETS = [1, 2, 3, 4];
const SCALE_MIN = 0.1;
const SCALE_MAX = 10;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const post = (msg: unknown) => parent.postMessage({ pluginMessage: msg }, '*');

let settings: Settings = { scale: 2, format: 'PNG', order: 'position', output: 'pdf' };
let items: Item[] = [];
let fileName = 'Untitled';
let editorType = 'figma';
let job: Job | null = null;

// ------------------------------------------------------------------ helpers

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  }
  return btoa(s);
}

/** Pixel size straight from the header, no decode. */
function imageSize(bytes: Uint8Array, format: ImageFormat): { w: number; h: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'PNG') return { w: dv.getUint32(16), h: dv.getUint32(20) };
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const m = bytes[i + 1];
    if (m === 0xff) { i += 1; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + dv.getUint16(i + 2);
  }
  throw new Error('Unreadable JPEG header');
}

function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  return s || 'figma-export';
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function fmtBytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ----------------------------------------------------------------- builders

async function buildPdf(imgs: Img[], scale: number, format: ImageFormat): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(fileName);
  pdf.setCreator('Figma2safePDF'); // pdf-lib always stamps Producer itself
  for (const img of imgs) {
    const embedded = format === 'PNG' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const w = (embedded.width / scale) * PX_TO_PT;
    const h = (embedded.height / scale) * PX_TO_PT;
    const page = pdf.addPage([w, h]);
    page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' });
}

async function buildPptx(imgs: Img[], format: ImageFormat): Promise<Blob> {
  const pptx = new PptxGenJS();
  // Slide size follows the first image's aspect ratio; the rest are letterboxed.
  const first = imageSize(imgs[0].bytes, format);
  const ar = first.w / first.h;
  const W = ar >= 1 ? SLIDE_LONG_EDGE_IN : +(SLIDE_LONG_EDGE_IN * ar).toFixed(3);
  const H = ar >= 1 ? +(SLIDE_LONG_EDGE_IN / ar).toFixed(3) : SLIDE_LONG_EDGE_IN;
  pptx.defineLayout({ name: 'FIGMA', width: W, height: H });
  pptx.layout = 'FIGMA';
  pptx.title = fileName;
  pptx.author = 'Figma2safePDF';
  const mime = format === 'PNG' ? 'image/png' : 'image/jpeg';
  for (const img of imgs) {
    const { w, h } = imageSize(img.bytes, format);
    const a = w / h;
    let dw = W;
    let dh = W / a;
    if (dh > H) { dh = H; dw = H * a; }
    const slide = pptx.addSlide();
    slide.addImage({ data: `${mime};base64,${toBase64(img.bytes)}`, x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh });
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

// ----------------------------------------------------------------------- UI

const el = {
  source: $('#source'),
  list: $<HTMLUListElement>('#list'),
  empty: $('#empty'),
  orderRow: $('#order-row'),
  scaleCustom: $<HTMLInputElement>('#scale-custom'),
  progress: $('#progress'),
  bar: $('#bar'),
  status: $('#status'),
  exportBtn: $<HTMLButtonElement>('#export'),
  cancelBtn: $<HTMLButtonElement>('#cancel'),
  refreshBtn: $<HTMLButtonElement>('#refresh'),
};

function setStatus(text: string, tone: '' | 'ok' | 'err' = '') {
  el.status.textContent = text;
  el.status.dataset.tone = tone;
}

function renderSettings() {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
    const key = seg.dataset.seg as keyof Settings;
    for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(String(settings[key]) === b.dataset.value));
    }
  }
  // A preset lights its button; anything else lives in the free-form box.
  el.scaleCustom.value = SCALE_PRESETS.includes(settings.scale) ? '' : String(settings.scale);
  renderIdle();
}

function renderCandidates(msg: { fromSelection: boolean; pageName: string }) {
  const n = items.length;
  const noun = editorType === 'slides' ? 'slide' : 'frame';
  el.source.textContent = msg.fromSelection
    ? `Selection · ${n} ${noun}${n === 1 ? '' : 's'}`
    : editorType === 'slides'
      ? `All slides · ${n}`
      : `Page “${msg.pageName}” · ${n} ${noun}${n === 1 ? '' : 's'}`;
  el.orderRow.hidden = editorType === 'slides';

  el.list.replaceChildren(
    ...items.map((it, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="idx">${i + 1}</span><span class="name"></span><span class="dim">${it.width}×${it.height}</span>`;
      (li.querySelector('.name') as HTMLElement).textContent = it.name;
      li.title = `${it.type} · click to locate`;
      li.onclick = () => post({ type: 'focus', id: it.id });
      return li;
    }),
  );
  el.empty.hidden = n > 0;
  renderIdle();
}

function renderIdle(withStatus = true) {
  if (job) return;
  const n = items.length;
  const noun = editorType === 'slides' ? 'slide' : 'page';
  el.exportBtn.disabled = n === 0;
  el.exportBtn.textContent = n ? `Export ${n} ${noun}${n === 1 ? '' : 's'} as ${settings.output.toUpperCase()}` : 'Nothing to export';
  el.progress.hidden = true;
  el.cancelBtn.hidden = true;
  if (!withStatus) return;
  if (n) {
    const first = items[0];
    const s = settings.scale;
    setStatus(`${Math.round(first.width * s)}×${Math.round(first.height * s)}px @${s}x · ${settings.format}`);
  } else {
    setStatus(editorType === 'slides' ? 'No slides found.' : 'Select frames, or leave empty to export the whole page.');
  }
}

function setBusy(busy: boolean) {
  el.exportBtn.disabled = busy;
  el.cancelBtn.hidden = !busy;
  el.progress.hidden = !busy;
  el.refreshBtn.disabled = busy;
  for (const b of document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.seg button, input')) b.disabled = busy;
}

function startExport() {
  if (!items.length) return;
  job = {
    images: new Array(items.length).fill(null),
    names: items.map((i) => i.name),
    scale: settings.scale,
    format: settings.format,
    output: settings.output,
    skipped: [],
  };
  setBusy(true);
  el.bar.style.width = '0%';
  setStatus('Rendering…');
  post({ type: 'export', ids: items.map((i) => i.id), scale: settings.scale, format: settings.format });
}

async function finishExport() {
  const j = job;
  if (!j) return;
  const imgs: Img[] = [];
  j.images.forEach((b, i) => { if (b) imgs.push({ bytes: b, name: j.names[i] }); });
  const base = safeFileName(fileName);
  try {
    if (!imgs.length) throw new Error('No images were rendered');
    el.bar.style.width = '100%';
    setStatus(`Building ${j.output.toUpperCase()}…`);
    const blob = j.output === 'pdf' ? await buildPdf(imgs, j.scale, j.format) : await buildPptx(imgs, j.format);
    download(blob, `${base}.${j.output}`);
    const skipped = j.skipped.length ? ` · ${j.skipped.length} skipped` : '';
    const summary = `${imgs.length} pages · ${j.output.toUpperCase()} ${fmtBytes(blob.size)}${skipped}`;
    setStatus(`Done · ${summary}`, 'ok');
    post({ type: 'notify', message: `Exported ${summary}` });
  } catch (e) {
    console.error(e);
    setStatus(`Failed: ${(e as Error).message ?? e}`, 'err');
    post({ type: 'notify', message: `Export failed: ${(e as Error).message ?? e}`, error: true });
  } finally {
    job = null;
    setBusy(false);
    renderIdle(false); // keep the done / failed line visible
  }
}

// ------------------------------------------------------------------- events

function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  post({ type: 'settings', settings: { [key]: value } });
  renderSettings();
}

for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
  seg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !b.dataset.value) return;
    const key = seg.dataset.seg as keyof Settings;
    const raw = b.dataset.value;
    if (key === 'scale') updateSetting('scale', Number(raw));
    else updateSetting(key, raw as never);
  });
}

function applyCustomScale() {
  const v = parseFloat(el.scaleCustom.value.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) { renderSettings(); return; }
  updateSetting('scale', Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 100) / 100)));
}
el.scaleCustom.addEventListener('change', applyCustomScale);
el.scaleCustom.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') el.scaleCustom.blur(); // blur fires 'change', which applies it once
});

el.exportBtn.onclick = startExport;
el.cancelBtn.onclick = () => { post({ type: 'cancel' }); setStatus('Cancelling…'); };
el.refreshBtn.onclick = () => post({ type: 'refresh' });

window.onmessage = (e: MessageEvent) => {
  const msg = e.data?.pluginMessage;
  if (!msg) return;
  switch (msg.type) {
    case 'settings':
      settings = msg.settings;
      renderSettings();
      break;
    case 'candidates':
      items = msg.items;
      fileName = msg.fileName;
      editorType = msg.editorType;
      renderCandidates(msg);
      break;
    case 'progress':
      if (job) {
        el.bar.style.width = `${(msg.index / msg.total) * 100}%`;
        setStatus(`Rendering ${msg.index + 1}/${msg.total} · ${msg.name}`);
      }
      break;
    case 'image':
      if (job) job.images[msg.index] = msg.bytes;
      break;
    case 'skip':
      if (job) job.skipped.push(msg.name);
      console.warn('skipped', msg.name, msg.reason);
      break;
    case 'done':
      void finishExport();
      break;
    case 'cancelled':
      job = null;
      setBusy(false);
      renderIdle(false);
      setStatus('Cancelled.');
      break;
  }
};

post({ type: 'ready' });
