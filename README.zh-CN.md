# Figma2safePDF

![Figma2safePDF — 所见即所得](assets/cover-1920x1080.png)

[English](README.md) · **中文**

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

```
manifest.json      插件清单（editorType figma + slides，dynamic-page，不联网）
src/code.ts        主线程：收集节点、排序、逐个 exportAsync
src/ui.ts          iframe：pdf-lib 拼 PDF、PptxGenJS 拼 PPTX、触发下载
src/ui.html        UI 骨架与样式，照着 Figma 自己的 Export 面板做的
build.mjs          esbuild：code.js 单独打包，ui.js 打包后内联进 ui.html
scripts/smoke.mjs  Node 冒烟测试
scripts/harness.html  浏览器测试台
assets/            Community 图标和封面（cover.html 用 headless Chrome 渲出 PNG）
docs/community-listing.md  Figma Community 发布页文案
```

## 已知边界

- JPG 用的是 Figma 自带的编码器，质量不可调；要更小的文件就用 JPG 加低倍率。
- 单张导出图有 Figma 自己的尺寸上限，超长页面配 4x 可能失败，失败的页会跳过并在状态栏计数。
- PPTX 只有一个版面尺寸，比例不一致的页会居中留白。

## 许可

MIT
