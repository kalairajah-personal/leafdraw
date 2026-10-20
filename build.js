// Build: dist/leafdraw.mjs (ESM), dist/leafdraw.js (IIFE global `leafdraw`, species auto-registered),
// data/traits.json (vocabulary for the Python pipeline).
import { build } from 'esbuild';
import fs from 'fs';
import { TRAITS, GLOSSARY, RULES, DEFAULTS } from './core/index.js';

fs.mkdirSync('dist', { recursive: true });
const banner = `/* leafdraw — botanically accurate procedural leaves. Single file, no dependencies. */`;
await build({ entryPoints: ['core/index.js'], bundle: true, format: 'esm', outfile: 'dist/leafdraw.mjs', minify: true, banner: { js: banner } });
fs.writeFileSync('dist/entry-iife.js', `import * as L from '../core/index.js';\nimport species from '../data/species.json';\nL.registerSpecies(species);\nexport default L;\n`);
await build({ entryPoints: ['dist/entry-iife.js'], bundle: true, format: 'iife', globalName: 'leafdraw', outfile: 'dist/leafdraw.js', minify: true, banner: { js: banner }, footer: { js: 'leafdraw=leafdraw.default;' }, loader: { '.json': 'json' } });
fs.unlinkSync('dist/entry-iife.js');
fs.writeFileSync('data/traits.json', JSON.stringify({ traits: TRAITS, glossary: GLOSSARY, rules: RULES.map((r) => ({ id: r.id, level: r.level, msg: r.msg })), defaults: DEFAULTS }, null, 1));
for (const f of ['dist/leafdraw.mjs', 'dist/leafdraw.js']) console.log(f, (fs.statSync(f).size / 1024).toFixed(1) + ' KB');

// Web studio: single self-contained HTML (bundle inlined).
const bundle = fs.readFileSync('dist/leafdraw.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const page = fs.readFileSync('web/app.html', 'utf8').replace('/*__LEAFDRAW__*/', () => bundle);
fs.writeFileSync('dist/leafdraw-studio.html', page);
console.log('dist/leafdraw-studio.html', (page.length / 1024).toFixed(1) + ' KB');
