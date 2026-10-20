#!/usr/bin/env node
// leafdraw CLI — botanically accurate procedural leaves.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  draw, registerSpecies, listSpecies, getSpecies, renderSVG, renderAnimatedSVG, renderGcode, renderHPGL,
  sceneToJSON, parseTraitList, validate, listTerms, composeScenes, TRAITS, VERSION,
} from '../core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, '..', 'data', 'species.json');
if (fs.existsSync(dataFile)) registerSpecies(JSON.parse(fs.readFileSync(dataFile, 'utf8')));

const HELP = `leafdraw ${VERSION} — botanically accurate procedural leaf drawings

USAGE
  leafdraw --species "Quercus alba" [options]
  leafdraw --traits "ovate, serrate, acuminate, pinnate" [options]

SOURCE
  -s, --species <id|name|common>   catalog species, or ANY plant name: resolved live from
                                   GBIF + Wikipedia + POWO (tier C), cached in species/auto/
      --resolve "<name>"           print the auto-resolved spec JSON (with evidence) and exit
      --offline                    never fetch; use catalog and cache only
  -t, --traits "<terms>"           build from glossary terms; "category=term" also accepted
  -p, --param key=value            numeric override, repeatable (e.g. -p length=120 -p lobeCount=5)
      --spec <file.json>           full spec file (traits + params [+ compound, palette])

DRAWING
      --seed <n>                   deterministic seed (default: random, printed to stderr)
      --view leaf|shoot            single leaf, or leaves on a stem by phyllotaxis
      --detail auto|full|medium|low  vein orders drawn (auto picks by size)
      --plate <n>                  n seeds of the same leaf on one sheet
      --cols <n>                   plate columns (default 3)

OUTPUT
  -f, --format svg|anim|json|gcode|hpgl|png   (default svg)
      --style line|hatch|stipple|color|botanical|cleared|silhouette|venation|photo
      --season summer|fall|spring|dried
      --labels                     name, family, seed and scale bar
      --order illustrator|growth|plotter      pen order (anim, plotter)
      --duration <s>               animation length (default 12)
      --width <px>                 PNG width (default 1600)
      --page A4|A3|A5|<w>x<h>      plotter page (default A4); --true-size keeps mm scale
  -o, --output <file>              write to file (default stdout; png requires -o)

INFO
      --list [query]               list catalog species
      --terms [category]           list trait vocabulary
      --validate "<terms>"         check a trait combination
      --info                       print resolved traits and validation for the source
  -h, --help`;

function parseArgs(argv) {
  const a = { params: {} };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    switch (k) {
      case '-s': case '--species': a.species = v(); break;
      case '-t': case '--traits': a.traits = v(); break;
      case '-p': case '--param': { const [pk, pv] = v().split('='); a.params[pk] = isNaN(+pv) ? pv : +pv; break; }
      case '--spec': a.spec = v(); break;
      case '--resolve': a.resolve = v(); break;
      case '--offline': a.offline = true; break;
      case '--seed': a.seed = +v(); break;
      case '--view': a.view = v(); break;
      case '--detail': a.detail = v(); break;
      case '--plate': a.plate = +v(); break;
      case '--cols': a.cols = +v(); break;
      case '-f': case '--format': a.format = v(); break;
      case '--style': a.style = v(); break;
      case '--season': a.season = v(); break;
      case '--labels': a.labels = true; break;
      case '--order': a.order = v(); break;
      case '--duration': a.duration = +v(); break;
      case '--width': a.width = +v(); break;
      case '--page': a.page = v(); break;
      case '--true-size': a.trueSize = true; break;
      case '-o': case '--output': a.output = v(); break;
      case '--list': a.list = argv[i + 1] && !argv[i + 1].startsWith('-') ? v() : ''; break;
      case '--terms': a.terms = argv[i + 1] && !argv[i + 1].startsWith('-') ? v() : ''; break;
      case '--validate': a.validate = v(); break;
      case '--info': a.info = true; break;
      case '-h': case '--help': a.help = true; break;
      default: console.error(`Unknown option: ${k}`); process.exit(2);
    }
  }
  return a;
}

const PAGES = { A5: { w: 148, h: 210 }, A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 }, LETTER: { w: 216, h: 279 } };

// Any-species: GBIF/Wikipedia/POWO → traits (core/auto.js). Cached per name.
async function resolveAny(name, offline) {
  const { resolveName } = await import('../core/auto.js');
  const dir = path.join(here, '..', 'species', 'auto');
  const file = path.join(dir, name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (offline) return null;
  const spec = await resolveName(name);
  if (!spec || spec.error) { if (spec?.error) console.error(spec.error); return null; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(spec, null, 1));
  console.error(`resolved ${spec.name} (${spec.family}) tier C · prior=${spec.auto.prior} · text traits: ${Object.entries(spec.auto.from).filter(([, v]) => v === 'text').map(([k]) => k).join(', ') || 'none'}`);
  return spec;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || process.argv.length <= 2) { console.log(HELP); return; }

  if (a.list != null) {
    const q = a.list.toLowerCase();
    for (const s of listSpecies()) {
      const line = `${s.id.padEnd(30)} ${s.name.padEnd(30)} ${(s.common || []).join(', ').padEnd(32)} tier ${s.tier}`;
      if (!q || line.toLowerCase().includes(q)) console.log(line);
    }
    return;
  }
  if (a.terms != null) {
    const t = listTerms();
    for (const [cat, v] of Object.entries(t)) {
      if (a.terms && cat !== a.terms) continue;
      console.log(`\n${v.label} (${cat})`);
      for (const [id, def] of Object.entries(v.terms)) console.log(`  ${id.padEnd(26)} ${def}`);
    }
    return;
  }
  if (a.validate) {
    const r = validate(parseTraitList(a.validate));
    console.log(JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings, implied: r.implied, traits: r.traits }, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  let spec;
  if (a.resolve) { const r = await resolveAny(a.resolve, a.offline); console.log(JSON.stringify(r, null, 1)); process.exit(r ? 0 : 1); }
  if (a.spec) spec = JSON.parse(fs.readFileSync(a.spec, 'utf8'));
  else if (a.species) {
    spec = getSpecies(a.species);
    if (!spec) spec = await resolveAny(a.species, a.offline);
    if (!spec) { console.error(`Species not found: ${a.species}. Try --list, or check the name (GBIF lookup failed).`); process.exit(2); }
  } else if (a.traits) spec = { id: 'custom', name: 'Custom leaf', traits: parseTraitList(a.traits), params: {} };
  else { console.error('Give --species, --traits or --spec. See --help.'); process.exit(2); }
  if (Object.keys(a.params).length) spec = { ...spec, params: { ...(spec.params || {}), ...a.params } };

  if (a.info) {
    const r = validate(spec.traits || {});
    console.log(JSON.stringify({ id: spec.id, name: spec.name, tier: spec.tier, traits: r.traits, implied: r.implied, warnings: r.warnings, errors: r.errors, params: spec.params, compound: spec.compound }, null, 2));
    return;
  }

  const seed = Number.isFinite(a.seed) ? a.seed : Math.floor(Math.random() * 1e6);
  if (!Number.isFinite(a.seed)) console.error(`seed ${seed}`);
  const opts = { view: a.view, detail: a.detail };
  let scene;
  try {
    if (a.plate > 1) scene = composeScenes(Array.from({ length: a.plate }, (_, i) => draw(spec, seed + i, opts)), { cols: a.cols || 3 });
    else scene = draw(spec, seed, opts);
  } catch (e) {
    console.error(e.message);
    if (e.validation) console.error(JSON.stringify(e.validation.errors, null, 2));
    process.exit(1);
  }

  const fmt = a.format || (a.output ? path.extname(a.output).slice(1) : 'svg') || 'svg';
  const ropts = { style: a.style || 'line', season: a.season || 'summer', labels: !!a.labels, order: a.order, duration: a.duration };
  let out;
  if (fmt === 'svg') out = renderSVG(scene, ropts);
  else if (fmt === 'anim') out = renderAnimatedSVG(scene, ropts);
  else if (fmt === 'json') out = sceneToJSON(scene);
  else if (fmt === 'gcode' || fmt === 'nc') out = renderGcode(scene, { page: pageOf(a.page), trueSize: a.trueSize, hatch: a.style === 'hatch' });
  else if (fmt === 'hpgl' || fmt === 'plt') out = renderHPGL(scene, { page: pageOf(a.page), trueSize: a.trueSize, hatch: a.style === 'hatch' });
  else if (fmt === 'png') {
    if (!a.output) { console.error('PNG needs -o <file>'); process.exit(2); }
    let Resvg;
    try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { console.error('PNG output needs: npm i @resvg/resvg-js'); process.exit(2); }
    const svg = renderSVG(scene, ropts);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: a.width || 1600 }, background: 'white' }).render().asPng();
    fs.writeFileSync(a.output, png);
    console.error(`wrote ${a.output}`);
    return;
  } else { console.error(`Unknown format: ${fmt}`); process.exit(2); }

  if (a.output) { fs.writeFileSync(a.output, out); console.error(`wrote ${a.output}`); }
  else process.stdout.write(out + '\n');
}

function pageOf(p) {
  if (!p) return PAGES.A4;
  const k = p.toUpperCase();
  if (PAGES[k]) return PAGES[k];
  const m = p.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
  if (m) return { w: +m[1], h: +m[2] };
  console.error(`Unknown page ${p}`); process.exit(2);
}

main();
