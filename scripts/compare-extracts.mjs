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
//   4. image counts per section.
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
const FONT_KEYS = ["family", "size", "weight", "lineHeight", "letterSpacing", "color", "transform", "decoration", "align"];
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

out.push(`\n**${differences} difference${differences === 1 ? "" : "s"}** (tolerance ${tol}px).`);
console.log(out.join("\n"));
process.exit(differences ? 1 : 0);

function fmt(n) { n = Math.round(n * 10) / 10; return (n > 0 ? "+" : "") + n; }
function short(s, n = 48) { s = String(s).replace(/\s+/g, " ").replace(/\|/g, "\\|"); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
