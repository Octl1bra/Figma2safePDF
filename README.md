# Figma2safePDF

![Figma2safePDF — what you see is what they get](assets/cover-1920x1080.png)

**English** · [中文](#中文)

Figma's built-in PDF and PPTX export is fragile: fonts get substituted, gradients and shadows break, layouts shift, and the files often open wrong in PowerPoint, Keynote, WeChat or on a phone. This plugin renders every frame or slide as one flat bitmap and packs those into a PDF or PPTX, so the file opens exactly like your canvas, everywhere. Side effect: there is no text layer and nothing editable.

- Works in Figma Design and Figma Slides
- Select nothing to export every top-level frame on the current page (sections are expanded); select frames to export only those
- Order: **Position** (row by row, left to right), **Layers** (layers-panel order), or **Number** (the first run of digits in each layer name: `03 Cover` → 3, unnumbered frames go last). Slides always use the presentation order
- Scale presets 1x–4x or any custom multiplier (0.1–10); PNG or JPG
- Output PDF **or** PPTX. PDF pages take the size of their frames; PPTX slides follow the aspect ratio of the first frame and center the rest
- Fully offline. `networkAccess` is `none`; nothing leaves Figma

## Install (local development plugin)

```bash
pnpm install
pnpm build          # writes dist/code.js and dist/ui.html
```

Figma desktop app → **Plugins → Development → Import plugin from manifest…** → pick `manifest.json` in this folder. Then run it from Plugins → Development → Figma2safePDF (or search it with ⌘/).

`dist/` is committed, so cloning and importing the manifest works without Node.

## Develop

```bash
pnpm watch          # rebuild on change, then re-run the plugin in Figma
pnpm typecheck
pnpm smoke          # Node: synthesise PNGs, build a PDF and a PPTX, check page counts and sizes
pnpm harness        # then open http://localhost:8766/scripts/harness.html
```

The harness is a fake Figma main thread: it feeds canvas-rendered images into the real `dist/ui.html` so the UI can be exercised in a browser. Switch to a fresh port if Chrome starts blocking downloads for the origin.

```
manifest.json      plugin manifest (editorType figma + slides, dynamic-page, no network)
src/code.ts        main thread: collect nodes, order them, exportAsync one by one
src/ui.ts          iframe: pdf-lib builds the PDF, PptxGenJS builds the PPTX, trigger download
src/ui.html        UI markup and styles, modelled on Figma's own Export panel
build.mjs          esbuild: code.js bundled alone, ui.js bundled and inlined into ui.html
scripts/smoke.mjs  Node smoke test for the builders
scripts/harness.html  browser harness
assets/            Community icon and cover (cover.html renders the PNG with headless Chrome)
docs/community-listing.md  copy for the Figma Community publish dialog
```

## Known limits

- JPG uses Figma's own encoder, so quality is not adjustable. For smaller files use JPG plus a lower scale.
- Figma caps the size of a single export; very tall pages at 4x may fail. Failed pages are skipped and counted in the status line.
- PPTX has a single slide size, so frames with a different aspect ratio are letterboxed.

## License

MIT

---

# 中文

Figma 自带的 PDF / PPTX 导出兼容性很差：字体被替换、渐变和阴影丢失、版式跑位，PowerPoint 和微信里经常直接打不开。这个插件把每个 Frame / Slide 渲染成一张位图，再拼成 PDF 或 PPTX，在哪打开都和画布上一模一样。顺带的好处是没有文字层、没有可编辑对象。

- 支持 Figma Design 和 Figma Slides
- 什么都不选：导出当前页面所有顶层 Frame（Section 自动展开）；选中了什么就只导什么
- 排序三选一：**Position**（画布位置，一行一行、从左到右）、**Layers**（图层面板顺序）、**Number**（图层名里从左数第一段连续数字，`03 Cover` → 3，没数字的排最后）；Slides 直接用演示顺序
- 倍率 1x–4x 预设，或随便填（0.1–10）；图片 PNG / JPG
- 输出 PDF **或** PPTX 二选一。PDF 每页尺寸跟随各自 Frame；PPTX 以第一页的比例定版面，其余页居中留白
- 完全离线，`networkAccess` 是 `none`，图片不出 Figma

## 安装（本地开发插件）

```bash
pnpm install
pnpm build          # 产出 dist/code.js 和 dist/ui.html
```

Figma 桌面端 → **Plugins → Development → Import plugin from manifest…** → 选本目录的 `manifest.json`。之后 Plugins → Development → Figma2safePDF 运行，或 ⌘/ 搜索。

`dist/` 已提交，clone 下来不装 Node 也能直接导入。

## 开发

```bash
pnpm watch          # 改代码自动重编，Figma 里重新运行插件即可
pnpm typecheck
pnpm smoke          # Node：生成 PNG → 构建 PDF/PPTX → 校验页数尺寸
pnpm harness        # 然后浏览器开 http://localhost:8766/scripts/harness.html
```

harness 是一个假的 Figma 主线程，用 canvas 画的图喂给真实的 `dist/ui.html`，不开 Figma 就能测 UI。Chrome 一旦开始拦下载就换个端口。

## 已知边界

- JPG 用的是 Figma 自带的编码器，质量不可调；要更小的文件就用 JPG 加低倍率。
- 单张导出图有 Figma 自己的尺寸上限，超长页面配 4x 可能失败，失败的页会跳过并在状态栏计数。
- PPTX 只有一个版面尺寸，比例不一致的页会居中留白。

## 许可

MIT
