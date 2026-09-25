# Figma Community 发布页文案

发布入口：Figma 桌面端 → 左上角 Figma 图标 → Plugins → Manage plugins → 本插件 → Publish。
发布前先把 manifest.json 里的 `id` 换成 Figma 分配的真实 ID（Plugins → Development → New plugin 生成一个模板，把它的 id 抄过来）。

素材在 `assets/`：`icon-128.png`（128×128）、`cover-1920x1080.png`（1920×1080）。源文件在个人工作区 Figma 文件的「Figma2safePDF」Section 里。

## Name

Figma2safePDF

## Tagline（一句话）

Export frames or slides as image-only PDF or PPTX. Nothing selectable, nothing editable.

## Description

Turn any set of frames — or a whole Figma Slides deck — into a PDF or PPTX where every page is a single flat image. No text layer, no vector objects, nothing to copy, edit or reverse-engineer. Built for sharing decks and design reviews outside the team.

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

Source code: github.com/Octl1bra/Figma2safePDF

## Category

Design tools

## Data security 页

- Does not collect or store any user data.
- No network access (`networkAccess.allowedDomains: ["none"]`).
- Reads only the current page and selection, writes nothing to the file.

## Support contact

填一个你愿意公开的邮箱。
