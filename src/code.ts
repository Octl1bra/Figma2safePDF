/// <reference types="@figma/plugin-typings" />
// Main thread (Figma sandbox). Collects the nodes to export, rasterises them
// with exportAsync and streams the bytes to the UI iframe, which builds the
// PDF / PPTX and triggers the download. Nothing here touches the network.

type Order = 'position' | 'layers' | 'number';
type ImageFormat = 'PNG' | 'JPG';

interface Settings {
  scale: number;
  format: ImageFormat;
  order: Order;
  output: 'pdf' | 'pptx';
}

type UIToMain =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'export'; ids: string[]; scale: number; format: ImageFormat }
  | { type: 'cancel' }
  | { type: 'focus'; id: string }
  | { type: 'notify'; message: string; error?: boolean }
  | { type: 'close' };

const DEFAULTS: Settings = { scale: 2, format: 'PNG', order: 'position', output: 'pdf' };
const SETTINGS_KEY = 'figma2safepdf.settings.v2';

// Node types that count as a "page" when nothing is selected.
const PAGE_TYPES = new Set<string>(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SLIDE']);

let settings: Settings = { ...DEFAULTS };
let exporting = false;
let cancelled = false;

figma.showUI(__html__, { width: 340, height: 560, themeColors: true });

// ---------------------------------------------------------------- candidates

function isWrapper(n: SceneNode): n is SectionNode | SlideGridNode | SlideRowNode {
  return n.type === 'SECTION' || n.type === 'SLIDE_GRID' || n.type === 'SLIDE_ROW';
}

/**
 * Flattens sections / slide grids into exportable leaves.
 * Directly selected nodes are always kept (the user asked for them);
 * nodes discovered inside wrappers must look like a page and be visible.
 */
function collect(roots: readonly SceneNode[], direct: boolean): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (n: SceneNode, isDirect: boolean) => {
    if (isWrapper(n)) {
      for (const c of n.children) visit(c, false);
      return;
    }
    if (isDirect || (PAGE_TYPES.has(n.type) && n.visible)) out.push(n);
  };
  for (const r of roots) visit(r, direct);
  return out;
}

function bounds(n: SceneNode): Rect {
  const b = n.absoluteBoundingBox;
  if (b) return b;
  const t = n.absoluteTransform;
  return { x: t[0][2], y: t[1][2], width: n.width, height: n.height };
}

/** Row-major reading order: cluster by y, then left to right. */
function sortByPosition(nodes: SceneNode[]): SceneNode[] {
  const items = nodes.map((n) => ({ n, b: bounds(n) }));
  items.sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x);
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && it.b.y < row[0].b.y + row[0].b.height * 0.5) row.push(it);
    else rows.push([it]);
  }
  for (const row of rows) row.sort((a, b) => a.b.x - b.b.x);
  return rows.flat().map((it) => it.n);
}

/** Layers-panel order: top of the panel = last child, so highest index first. */
function sortByLayers(nodes: SceneNode[], page: PageNode): SceneNode[] {
  const index = new Map<string, number>();
  let i = 0;
  const walk = (n: SceneNode) => {
    index.set(n.id, i++);
    if (isWrapper(n)) for (const c of n.children) walk(c);
  };
  for (const c of page.children) walk(c);
  return [...nodes].sort((a, b) => (index.get(b.id) ?? -1) - (index.get(a.id) ?? -1));
}

/** First run of digits in the name, reading from the left: "03 Cover" → 3, "iPhone 14 / 2" → 14. */
function firstNumber(name: string): number | null {
  const m = /\d+/.exec(name);
  return m ? parseInt(m[0], 10) : null;
}

/** By that number ascending; unnumbered nodes go last; ties fall back to position order. */
function sortByNumber(nodes: SceneNode[]): SceneNode[] {
  const rank = new Map(sortByPosition(nodes).map((n, i) => [n.id, i] as const));
  return [...nodes].sort((a, b) => {
    const na = firstNumber(a.name);
    const nb = firstNumber(b.name);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  });
}

function orderNodes(nodes: SceneNode[], page: PageNode): SceneNode[] {
  // Slides: document order is the presentation order. Never re-sort.
  if (figma.editorType === 'slides') return nodes;
  switch (settings.order) {
    case 'layers': return sortByLayers(nodes, page);
    case 'number': return sortByNumber(nodes);
    default: return sortByPosition(nodes);
  }
}

async function sendCandidates() {
  if (exporting) return;
  const page = figma.currentPage;
  const sel = page.selection;
  const fromSelection = sel.length > 0;
  const nodes = orderNodes(fromSelection ? collect(sel, true) : collect(page.children, false), page);
  figma.ui.postMessage({
    type: 'candidates',
    fileName: figma.root.name,
    pageName: page.name,
    editorType: figma.editorType,
    fromSelection,
    items: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      width: Math.round(n.width),
      height: Math.round(n.height),
    })),
  });
}

// -------------------------------------------------------------------- export

async function runExport(ids: string[], scale: number, format: ImageFormat) {
  exporting = true;
  cancelled = false;
  const total = ids.length;
  try {
    for (let i = 0; i < total; i++) {
      if (cancelled) break;
      const node = await figma.getNodeByIdAsync(ids[i]);
      if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
        figma.ui.postMessage({ type: 'skip', index: i, name: '(missing)', reason: 'node no longer exists' });
        continue;
      }
      figma.ui.postMessage({ type: 'progress', index: i, total, name: node.name });
      try {
        const bytes = await (node as SceneNode).exportAsync({
          format,
          constraint: { type: 'SCALE', value: scale },
        });
        figma.ui.postMessage({ type: 'image', index: i, name: node.name, bytes });
      } catch (e) {
        figma.ui.postMessage({ type: 'skip', index: i, name: node.name, reason: String(e) });
      }
    }
    figma.ui.postMessage({ type: cancelled ? 'cancelled' : 'done' });
  } finally {
    exporting = false;
  }
}

// ------------------------------------------------------------------ messages

figma.ui.onmessage = async (msg: UIToMain) => {
  switch (msg.type) {
    case 'ready': {
      const stored = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<Settings> | undefined;
      settings = { ...DEFAULTS, ...(stored ?? {}) };
      figma.ui.postMessage({ type: 'settings', settings });
      await sendCandidates();
      break;
    }
    case 'refresh':
      await sendCandidates();
      break;
    case 'settings': {
      const orderChanged = msg.settings.order !== undefined && msg.settings.order !== settings.order;
      settings = { ...settings, ...msg.settings };
      await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
      if (orderChanged) await sendCandidates();
      break;
    }
    case 'export':
      if (!exporting) await runExport(msg.ids, msg.scale, msg.format);
      break;
    case 'cancel':
      cancelled = true;
      break;
    case 'focus': {
      // Scroll only. Changing the selection would change the export set.
      const n = await figma.getNodeByIdAsync(msg.id);
      if (n && n.type !== 'DOCUMENT' && n.type !== 'PAGE') figma.viewport.scrollAndZoomIntoView([n as SceneNode]);
      break;
    }
    case 'notify':
      figma.notify(msg.message, { error: msg.error === true });
      break;
    case 'close':
      figma.closePlugin();
      break;
  }
};

figma.on('selectionchange', () => void sendCandidates());
figma.on('currentpagechange', () => void sendCandidates());
