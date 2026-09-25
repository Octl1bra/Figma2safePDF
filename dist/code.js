"use strict";
(() => {
  // src/code.ts
  var DEFAULTS = { scale: 2, format: "PNG", order: "position", output: "pdf" };
  var SETTINGS_KEY = "figma2safepdf.settings.v2";
  var PAGE_TYPES = /* @__PURE__ */ new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SLIDE"]);
  var settings = { ...DEFAULTS };
  var exporting = false;
  var cancelled = false;
  figma.showUI(__html__, { width: 340, height: 560, themeColors: true });
  function isWrapper(n) {
    return n.type === "SECTION" || n.type === "SLIDE_GRID" || n.type === "SLIDE_ROW";
  }
  function collect(roots, direct) {
    const out = [];
    const visit = (n, isDirect) => {
      if (isWrapper(n)) {
        for (const c of n.children) visit(c, false);
        return;
      }
      if (isDirect || PAGE_TYPES.has(n.type) && n.visible) out.push(n);
    };
    for (const r of roots) visit(r, direct);
    return out;
  }
  function bounds(n) {
    const b = n.absoluteBoundingBox;
    if (b) return b;
    const t = n.absoluteTransform;
    return { x: t[0][2], y: t[1][2], width: n.width, height: n.height };
  }
  function sortByPosition(nodes) {
    const items = nodes.map((n) => ({ n, b: bounds(n) }));
    items.sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x);
    const rows = [];
    for (const it of items) {
      const row = rows[rows.length - 1];
      if (row && it.b.y < row[0].b.y + row[0].b.height * 0.5) row.push(it);
      else rows.push([it]);
    }
    for (const row of rows) row.sort((a, b) => a.b.x - b.b.x);
    return rows.flat().map((it) => it.n);
  }
  function sortByLayers(nodes, page) {
    const index = /* @__PURE__ */ new Map();
    let i = 0;
    const walk = (n) => {
      index.set(n.id, i++);
      if (isWrapper(n)) for (const c of n.children) walk(c);
    };
    for (const c of page.children) walk(c);
    return [...nodes].sort((a, b) => {
      var _a, _b;
      return ((_a = index.get(b.id)) != null ? _a : -1) - ((_b = index.get(a.id)) != null ? _b : -1);
    });
  }
  function firstNumber(name) {
    const m = /\d+/.exec(name);
    return m ? parseInt(m[0], 10) : null;
  }
  function sortByNumber(nodes) {
    const rank = new Map(sortByPosition(nodes).map((n, i) => [n.id, i]));
    return [...nodes].sort((a, b) => {
      var _a, _b;
      const na = firstNumber(a.name);
      const nb = firstNumber(b.name);
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na === null !== (nb === null)) return na === null ? 1 : -1;
      return ((_a = rank.get(a.id)) != null ? _a : 0) - ((_b = rank.get(b.id)) != null ? _b : 0);
    });
  }
  function orderNodes(nodes, page) {
    if (figma.editorType === "slides") return nodes;
    switch (settings.order) {
      case "layers":
        return sortByLayers(nodes, page);
      case "number":
        return sortByNumber(nodes);
      default:
        return sortByPosition(nodes);
    }
  }
  async function sendCandidates() {
    if (exporting) return;
    const page = figma.currentPage;
    const sel = page.selection;
    const fromSelection = sel.length > 0;
    const nodes = orderNodes(fromSelection ? collect(sel, true) : collect(page.children, false), page);
    figma.ui.postMessage({
      type: "candidates",
      fileName: figma.root.name,
      pageName: page.name,
      editorType: figma.editorType,
      fromSelection,
      items: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        width: Math.round(n.width),
        height: Math.round(n.height)
      }))
    });
  }
  async function runExport(ids, scale, format) {
    exporting = true;
    cancelled = false;
    const total = ids.length;
    try {
      for (let i = 0; i < total; i++) {
        if (cancelled) break;
        const node = await figma.getNodeByIdAsync(ids[i]);
        if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
          figma.ui.postMessage({ type: "skip", index: i, name: "(missing)", reason: "node no longer exists" });
          continue;
        }
        figma.ui.postMessage({ type: "progress", index: i, total, name: node.name });
        try {
          const bytes = await node.exportAsync({
            format,
            constraint: { type: "SCALE", value: scale }
          });
          figma.ui.postMessage({ type: "image", index: i, name: node.name, bytes });
        } catch (e) {
          figma.ui.postMessage({ type: "skip", index: i, name: node.name, reason: String(e) });
        }
      }
      figma.ui.postMessage({ type: cancelled ? "cancelled" : "done" });
    } finally {
      exporting = false;
    }
  }
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "ready": {
        const stored = await figma.clientStorage.getAsync(SETTINGS_KEY);
        settings = { ...DEFAULTS, ...stored != null ? stored : {} };
        figma.ui.postMessage({ type: "settings", settings });
        await sendCandidates();
        break;
      }
      case "refresh":
        await sendCandidates();
        break;
      case "settings": {
        const orderChanged = msg.settings.order !== void 0 && msg.settings.order !== settings.order;
        settings = { ...settings, ...msg.settings };
        await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
        if (orderChanged) await sendCandidates();
        break;
      }
      case "export":
        if (!exporting) await runExport(msg.ids, msg.scale, msg.format);
        break;
      case "cancel":
        cancelled = true;
        break;
      case "focus": {
        const n = await figma.getNodeByIdAsync(msg.id);
        if (n && n.type !== "DOCUMENT" && n.type !== "PAGE") figma.viewport.scrollAndZoomIntoView([n]);
        break;
      }
      case "notify":
        figma.notify(msg.message, { error: msg.error === true });
        break;
      case "close":
        figma.closePlugin();
        break;
    }
  };
  figma.on("selectionchange", () => void sendCandidates());
  figma.on("currentpagechange", () => void sendCandidates());
})();
