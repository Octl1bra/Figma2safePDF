# Figma2safePDF

Figma 自带的 PDF / PPTX 导出兼容性很差：字体被替换、渐变和阴影丢失、版式跑位，PowerPoint 和微信里经常直接打不开。这个插件把每个 Frame / Slide 渲染成一张位图，再拼成 PDF 或 PPTX，在哪打开都和画布上一模一样。顺带的好处是没有文字层、没有可编辑对象。

- 支持 Figma Design 和 Figma Slides 两种编辑器
- 什么都不选：导出当前页面所有顶层 Frame（Section 会自动展开成里面的 Frame）；选中了什么就只导什么
- 排序三选一：Position（画布位置，一行一行、从左到右）、Layers（图层面板顺序）、Number（图层名里从左数第一段连续数字，`03 Cover` → 3，没数字的排最后）；Slides 直接用演示顺序
- 倍率 1x–4x 预设，或在旁边的框里随便填（0.1–10）；图片 PNG / JPG
- 输出 PDF 或 PPTX 二选一
- PDF 每页尺寸跟随各自 Frame；PPTX 以第一页的比例定版面，其余页居中留白
- 完全离线，`networkAccess` 是 `none`，图片不出本机

## 安装（本地开发插件）

```bash
pnpm install
pnpm build          # 产出 dist/code.js 和 dist/ui.html
```

Figma 桌面端 → 菜单 **Plugins → Development → Import plugin from manifest…** → 选本目录的 `manifest.json`。
之后在任意文件里 Plugins → Development → Figma2safePDF 运行。

改代码时 `pnpm watch`，Figma 里重新运行插件即可。

## 结构

```
manifest.json      Figma 插件清单（editorType: figma + slides，dynamic-page）
src/code.ts        主线程：收集节点、排序、exportAsync 逐张吐给 UI
src/ui.ts          iframe：pdf-lib 拼 PDF、PptxGenJS 拼 PPTX、触发下载
src/ui.html        UI 骨架与样式（照着 Figma 自己的 Export 面板做的：11px Inter、8px 节奏、themeColors 变量）
build.mjs          esbuild：code.js 单独打包，ui.js 打包后内联进 ui.html
scripts/smoke.mjs  Node 冒烟测试：生成 PNG → 走一遍 PDF/PPTX 构建 → 校验页数尺寸
```

## 已知边界

- JPG 用的是 Figma 自带的编码器，质量不可调；要更小的文件就用 JPG + 低倍率。
- 单张导出图有 Figma 自己的尺寸上限，超长页面配 4x 可能失败，失败的页会被跳过并在状态栏计数。
- PPTX 只有一个版面尺寸（PowerPoint 的限制），比例不一致的页会居中留白。
