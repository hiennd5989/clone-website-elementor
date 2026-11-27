#!/usr/bin/env node
// Compare two extract-source.js results taken at the same viewport: the source page and the rendered clone.
//
//   node compare-extracts.mjs <source-extract.json> <result-extract.json> [--tolerance=2]
//
// Prints, as Markdown:
//   1. the two section stacks side by side (top, height), so missing or extra sections and height drift show up;
//   2. every source text whose position, size, or typography differs in the result (matched by text content,
//      ignoring case and whitespace, so a text-transform difference is reported rather than hiding the match);
//   3. source texts missing from the result, and result texts that the source does not have;
//   4. image counts per section;
//   5. controls (links, buttons, fields) whose fill, color, border, radius, opacity or transition time differs
//      (a theme painting every button black, transitions killed by a reduced-motion rule), and missing/extra ones;
//   6. the floating layer (fixed teasers, chat bubbles, back-to-top) and the source's third-party widgets.
// Exit code 1 when anything differs, so it can gate "done".
import { readFileSync } from "node:fs";

const [srcPath, resPath, ...rest] = process.argv.slice(2);
if (!srcPath || !resPath) {
  console.error("Usage: node compare-extracts.mjs <source-extract.json> <result-extract.json> [--tolerance=2]");
  process.exit(2);
}
const tol = Number((rest.find((a) => a.startsWith("--tolerance=")) || "=2").split("=")[1]);
const load = (p) => {
  let d = JSON.parse(readFileSync(p, "utf8"));
  if (typeof d === "string") d = JSON.parse(d); // saved by a tool that kept the JSON string
  return d;
};
const src = load(srcPath);
const res = load(resPath);
if (src.viewport.w !== res.viewport.w) console.log(`> Warning: viewports differ (${src.viewport.w} vs ${res.viewport.w}).\n`);

let differences = 0;
const out = [];
out.push(`# ${src.url} → ${res.url} at ${src.viewport.w}px\n`);
out.push(`Document height: ${src.documentHeight} → ${res.documentHeight} (${fmt(res.documentHeight - src.documentHeight)})\n`);
if (Math.abs(res.documentHeight - src.documentHeight) > tol) differences++;

// 1. Section stacks.
out.push("## Sections\n\n| # | source | top | height | result | top | height |\n| --- | --- | --- | --- | --- | --- | --- |");
const rows = Math.max(src.sections.length, res.sections.length);
for (let i = 0; i < rows; i++) {
  const a = src.sections[i];
  const b = res.sections[i];
  const cell = (s) => (s ? [short(s.key || s.cls), s.box.y, s.box.h] : ["—", "", ""]);
  const [an, ay, ah] = cell(a);
  const [bn, by, bh] = cell(b);
  const flag = a && b && (Math.abs(a.box.y - b.box.y) > tol || Math.abs(a.box.h - b.box.h) > tol) ? " ⚠" : "";
  if (flag || !a || !b) differences++;
  out.push(`| ${i} | ${an} | ${ay} | ${ah} | ${bn} | ${by} | ${bh}${flag} |`);
}

// 2–3. Texts.
const norm = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();
const all = (d) => d.sections.flatMap((s, si) => s.texts.map((t) => ({ ...t, section: si })));
const srcTexts = all(src);
const pool = all(res);
const used = new Set();
const FONT_KEYS = ["opacity", "family", "size", "weight", "lineHeight", "letterSpacing", "color", "transform", "decoration", "align"];
const firstFamily = (f) => (f || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
const textRows = [];
const missing = [];
for (const t of srcTexts) {
  const key = norm(t.text);
  // Nearest unused result text with the same content.
  let best = -1;
  let bestDist = Infinity;
  pool.forEach((r, i) => {
    if (used.has(i) || norm(r.text) !== key) return;
    const dist = Math.abs(r.box.y - t.box.y) + Math.abs(r.box.x - t.box.x);
    if (dist < bestDist) { best = i; bestDist = dist; }
  });
  if (best < 0) { missing.push(t); continue; }
  used.add(best);
  const r = pool[best];
  const notes = [];
  for (const k of ["x", "y", "w", "h"]) {
    const d = r.box[k] - t.box[k];
    if (Math.abs(d) > tol) notes.push(`${k} ${fmt(d)}`);
  }
  for (const k of FONT_KEYS) {
    const a = k === "family" ? firstFamily(t.font[k]) : t.font[k];
    const b = k === "family" ? firstFamily(r.font[k]) : r.font[k];
    // Pixel values within 0.1px are the same (fluid clamp() sizes round differently).
    if (a === undefined && b === undefined) continue; // extracts from an older script version
    const pa = parseFloat(a), pb = parseFloat(b);
    if (/px$/.test(a || "") && /px$/.test(b || "") && Math.abs(pa - pb) <= 0.1) continue;
    if ((a || "") !== (b || "")) notes.push(`${k} ${a ?? "—"} → ${b ?? "—"}`);
  }
  if (notes.length) textRows.push(`| ${short(t.text, 40)} | ${t.section} | ${notes.join("; ")} |`);
}
out.push(`\n## Texts that differ (${textRows.length} of ${srcTexts.length})\n`);
if (textRows.length) out.push("| text | section | difference (result − source) |\n| --- | --- | --- |\n" + textRows.join("\n"));
else out.push("None.");
differences += textRows.length;

out.push(`\n## Source texts missing from the result (${missing.length})\n`);
out.push(missing.length ? missing.map((t) => `- [${t.section}] ${short(t.text, 80)}`).join("\n") : "None.");
const extra = pool.filter((_, i) => !used.has(i));
out.push(`\n## Result texts not in the source (${extra.length})\n`);
out.push(extra.length ? extra.map((t) => `- [${t.section}] ${short(t.text, 80)}`).join("\n") : "None.");
differences += missing.length + extra.length;

// 4. Images per section.
out.push("\n## Images per section (img / svg / background)\n\n| # | source | result |\n| --- | --- | --- |");
const count = (s) => s ? `${s.images.filter((i) => i.src).length} / ${s.images.filter((i) => i.svg).length} / ${s.images.filter((i) => i.background).length}` : "—";
for (let i = 0; i < rows; i++) out.push(`| ${i} | ${count(src.sections[i])} | ${count(res.sections[i])} |`);

// 5. Controls, matched by tag + label (nearest unused one by position).
if (src.controls && res.controls) {
  const ctlRows = [];
  const ctlUsed = new Set();
  const ctlMissing = [];
  const keyOf = (c) => `${c.tag === "a" ? "a" : "control"}|${norm(c.label)}`;
  for (const c of src.controls) {
    if (!c.label) continue;
    let best = -1, bestDist = Infinity;
    res.controls.forEach((r, i) => {
      if (ctlUsed.has(i) || keyOf(r) !== keyOf(c)) return;
      const dist = Math.abs(r.box.y - c.box.y) + Math.abs(r.box.x - c.box.x);
      if (dist < bestDist) { best = i; bestDist = dist; }
    });
    if (best < 0) { ctlMissing.push(c); continue; }
    ctlUsed.add(best);
    const r = res.controls[best];
    const notes = [];
    for (const k of ["background", "color", "border", "radius", "opacity"]) if (String(c[k]) !== String(r[k])) notes.push(`${k} ${c[k]} → ${r[k]}`);
    // Transition time: 0 on one side only means a lost (or invented) animation; otherwise allow 50ms.
    const ta = c.motion?.ms ?? 0, tb = r.motion?.ms ?? 0;
    if ((ta === 0) !== (tb === 0) || Math.abs(ta - tb) > 50) notes.push(`transition ${ta}ms (${c.motion?.props || "—"}) → ${tb}ms (${r.motion?.props || "—"})`);
    for (const k of ["w", "h"]) if (Math.abs(r.box[k] - c.box[k]) > tol) notes.push(`${k} ${fmt(r.box[k] - c.box[k])}`);
    if (notes.length) ctlRows.push(`| ${c.tag} | ${short(c.label, 36)} | ${notes.join("; ")} |`);
  }
  const ctlExtra = res.controls.filter((r, i) => r.label && !ctlUsed.has(i));
  out.push(`\n## Controls that differ (${ctlRows.length})\n`);
  out.push(ctlRows.length ? "| tag | label | difference (source → result) |\n| --- | --- | --- |\n" + ctlRows.join("\n") : "None.");
  out.push(`\n## Source controls missing from the result (${ctlMissing.length})\n`);
  out.push(ctlMissing.length ? ctlMissing.map((c) => `- ${c.tag} "${short(c.label, 60)}" at ${c.box.x},${c.box.y}`).join("\n") : "None.");
  out.push(`\n## Result controls not in the source (${ctlExtra.length})\n`);
  // Off-screen but focusable: usually a theme's off-canvas panel (mobile menu, cart) printed on every page.
  const where = (c) => (c.box.x + c.box.w <= 0 || c.box.x >= res.viewport.w ? " — off-screen, still focusable (a theme panel?)" : "");
  out.push(ctlExtra.length ? ctlExtra.map((c) => `- ${c.tag} "${short(c.label, 60)}" at ${c.box.x},${c.box.y}${where(c)}`).join("\n") : "None.");
  differences += ctlRows.length + ctlMissing.length + ctlExtra.length;
  if (src.reducedMotion !== res.reducedMotion) out.push(`\n> prefers-reduced-motion differs between the captures (${src.reducedMotion} → ${res.reducedMotion}): capture both with the same emulation.`);
  else if (res.reducedMotion) out.push("\n> Captured with prefers-reduced-motion: reduce. Elementor zeroes every transition in this mode (html * { transition-duration: 0s !important }): a control whose transition dropped to 0ms shows it.");
}

// 6. Floating layer and third-party widgets.
if (src.floating && res.floating) {
  out.push("\n## Floating layer (fixed boxes on screen, viewport coordinates)\n\n| source | box | result | box |\n| --- | --- | --- | --- |");
  const fUsed = new Set();
  const b = (x) => `${x.box.x},${x.box.y} ${x.box.w}×${x.box.h}`;
  for (const f of src.floating) {
    const i = res.floating.findIndex((r, j) => !fUsed.has(j) && norm(r.label) === norm(f.label));
    const r = i >= 0 ? res.floating[i] : null;
    if (r) fUsed.add(i);
    const off = r && ["x", "y", "w", "h"].some((k) => Math.abs(r.box[k] - f.box[k]) > tol);
    if (!r || off) differences++;
    out.push(`| ${short(f.label || f.cls, 40)} | ${b(f)} | ${r ? short(r.label || r.cls, 40) : "— missing"} | ${r ? b(r) + (off ? " ⚠" : "") : ""} |`);
  }
  res.floating.forEach((r, j) => {
    if (fUsed.has(j)) return;
    differences++;
    out.push(`| — extra | | ${short(r.label || r.cls, 40)} | ${b(r)} |`);
  });
}
if (src.thirdParty?.length) {
  out.push("\n## Third-party widgets on the source\n");
  out.push(src.thirdParty.map((t) => `- ${t}`).join("\n"));
  out.push("\nEach is part of the page for real visitors (a chat bubble, a signup teaser, reviews) even when it did not render in this browser: many refuse automated browsers. Reproduce it, or list it as left out in the report with the user's agreement.");
}

out.push(`\n**${differences} difference${differences === 1 ? "" : "s"}** (tolerance ${tol}px).`);
console.log(out.join("\n"));
process.exit(differences ? 1 : 0);

function fmt(n) { n = Math.round(n * 10) / 10; return (n > 0 ? "+" : "") + n; }
function short(s, n = 48) { s = String(s).replace(/\s+/g, " ").replace(/\|/g, "\\|"); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
