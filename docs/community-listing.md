# Figma Community 发布页文案

发布入口：Figma 桌面端 → 左上角 Figma 图标 → Plugins → Manage plugins → 本插件 → Publish。
发布前先把 manifest.json 里的 `id` 换成 Figma 分配的真实 ID（Plugins → Development → New plugin 生成一个模板，把它的 id 抄过来）。

素材在 `assets/`：`icon-128.png`（128×128）、`cover-1920x1080.png`（1920×1080）。源文件在个人工作区 Figma 文件的「Figma2safePDF」Section 里。

## Name

Figma2safePDF

## Tagline（一句话）

Export frames or slides as PDF or PPTX that look exactly like your canvas, in every viewer.

## Description

Figma's built-in PDF and PPTX export is fragile: fonts get substituted, gradients and shadows break, layouts shift, and the files often open wrong in PowerPoint, Keynote, WeChat or on a phone. Figma2safePDF renders every frame as one flat image and packs those into a PDF or PPTX, so what you see on the canvas is exactly what they get.

**How it works**
- Select the frames you want, or select nothing to export every top-level frame on the page (sections are expanded automatically).
- Pick the order: by canvas position (row by row), by layer order, or by the first number in each layer name.
- Choose a scale (1x–4x presets, or any custom multiplier), PNG or JPG, and PDF or PPTX.
- Click Export. The file downloads straight from the plugin.

**Details**
- PDF pages take the size of their frames; mixed sizes are fine.
- PPTX slides follow the aspect ratio of the first frame; other frames are centered.
- Works in Figma Design and Figma Slides.
- Fully offline. The plugin declares no network access and never uploads your designs anywhere.
- Side effect: there is no text layer and nothing editable, which is handy when sharing decks outside the team.

Source code: github.com/Octl1bra/Figma2safePDF

## Category

Design tools

## Data security 页

- Does not collect or store any user data.
- No network access (`networkAccess.allowedDomains: ["none"]`).
- Reads only the current page and selection, writes nothing to the file.

## Support contact

填一个你愿意公开的邮箱。
