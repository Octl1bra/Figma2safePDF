// Two bundles: dist/code.js (Figma sandbox) and dist/ui.html (iframe, JS inlined).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });

/** @type {esbuild.BuildOptions} */
const codeOpts = {
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2019',
  format: 'iife',
  platform: 'browser',
  logLevel: 'info',
};

const inlineUi = {
  name: 'inline-ui',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      // A literal "</script>" inside the bundle would terminate the inline tag.
      const js = readFileSync('dist/ui.js', 'utf8').replace(/<\/script/gi, '<\\/script');
      const html = readFileSync('src/ui.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
      writeFileSync('dist/ui.html', html);
      console.log(`  dist/ui.html  ${(html.length / 1024).toFixed(1)}kb`);
    });
  },
};

/** @type {esbuild.BuildOptions} */
const uiOpts = {
  entryPoints: ['src/ui.ts'],
  bundle: true,
  outfile: 'dist/ui.js',
  target: 'es2020',
  format: 'iife',
  platform: 'browser',
  minify: !watch,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [inlineUi],
};

if (watch) {
  const [c, u] = await Promise.all([esbuild.context(codeOpts), esbuild.context(uiOpts)]);
  await Promise.all([c.watch(), u.watch()]);
  console.log('watching…');
} else {
  await Promise.all([esbuild.build(codeOpts), esbuild.build(uiOpts)]);
}
