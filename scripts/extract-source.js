// Run in the SOURCE page's browser context (DevTools evaluate / the browser tool's "run script").
// Paste the whole file as one expression, or wrap it: (() => { ...file... })().
// Returns an object (in the DevTools console, wrap the call in copy(...) to copy it as JSON) with the page's breakpoints, section stack, and, per section, its geometry, layout styles,
// texts with typography, images, and links. Save the result as
// docs/research/<site-slug>/extract-<width>.json, once at desktop width (1440) and once at mobile width (390),
// after scrolling to the bottom so lazy content has loaded.
(() => {
  const VW = window.innerWidth;
  const round = (n) => Math.round(n * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.left + scrollX), y: round(r.top + scrollY), w: round(r.width), h: round(r.height) };
  };
  // The box of the element's own text (its text nodes), independent of padding or of a block that is wider
  // than the words: compare this between source and clone, since the markup around a text usually differs.
  const inkBox = (el) => {
    const range = document.createRange();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (!q.width) continue;
        l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      }
    }
    return l === Infinity ? box(el) : { x: round(l + scrollX), y: round(t + scrollY), w: round(r - l), h: round(b - t) };
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'SVG', 'IFRAME']);
  // Boxes with display: contents, or of zero height (a sticky overlay header's wrapper), still show their children:
  // use the children instead.
  const kids = (el) => [...el.children].flatMap((c) => {
    if (SKIP.has(c.tagName.toUpperCase())) return [];
    const s = getComputedStyle(c);
    if (s.display === 'none' || s.visibility === 'hidden') return [];
    if (s.display === 'contents' || c.getBoundingClientRect().height <= 1) return kids(c);
    return visible(c) ? [c] : [];
  });
  const layout = (el) => {
    const s = getComputedStyle(el);
    const out = {
      display: s.display, position: s.position, padding: s.padding, margin: s.margin,
      background: s.backgroundColor, backgroundImage: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 300) : undefined,
      backgroundSize: s.backgroundImage !== 'none' ? s.backgroundSize : undefined,
      border: s.borderTopWidth !== '0px' ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : undefined,
      radius: s.borderRadius !== '0px' ? s.borderRadius : undefined,
      maxWidth: s.maxWidth !== 'none' ? s.maxWidth : undefined,
    };
    if (s.display.includes('flex')) Object.assign(out, { direction: s.flexDirection, wrap: s.flexWrap, justify: s.justifyContent, align: s.alignItems, gap: s.gap });
    if (s.display.includes('grid')) Object.assign(out, { columns: s.gridTemplateColumns, rows: s.gridTemplateRows, gap: s.gap });
    Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
    return out;
  };
  const font = (el) => {
    const s = getComputedStyle(el);
    return {
      family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, color: s.color, transform: s.textTransform !== 'none' ? s.textTransform : undefined,
      align: s.textAlign, decoration: s.textDecorationLine !== 'none' ? s.textDecorationLine : undefined,
    };
  };

  // The section stack: descend through single-child wrappers, and flatten wrappers whose children are all full-width.
  let root = document.body;
  while (kids(root).length === 1) root = kids(root)[0];
  const sections = [];
  const collect = (parent, depth) => {
    for (const c of kids(parent)) {
      const r = c.getBoundingClientRect();
      const inner = kids(c);
      // A wrapper is a tall box (taller than the viewport) holding one block, or stacking full-width blocks.
      // Shorter boxes are sections in their own right, whatever their nesting.
      const fullWidth = inner.filter((k) => k.getBoundingClientRect().width >= r.width * 0.95).length;
      // A single child narrower than its parent (a padded grid inside a section) is that section's content,
      // not a section of its own: stop there.
      const wrapper = depth < 6 && r.width >= VW * 0.5 && r.height > window.innerHeight * 0.9
        && ((inner.length === 1 && fullWidth === 1) || (fullWidth >= 2 && fullWidth >= inner.length - 1));
      if (wrapper) collect(c, depth + 1);
      // Off-canvas panels (a closed cart drawer parked beside the viewport) are not part of the page.
      else if (r.right <= 1 || r.left >= VW - 1) continue;
      else if (r.width >= VW * 0.5 || getComputedStyle(c).position === 'fixed') sections.push(c);
    }
  };
  collect(root, 0);

  const describe = (sec, i) => {
    const texts = [], images = [], links = [];
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_ELEMENT);
    for (let el = sec; el; el = walker.nextNode()) {
      if (SKIP.has(el.tagName.toUpperCase()) && el.tagName.toUpperCase() !== 'SVG') continue;
      if (!visible(el)) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (own && texts.length < 120) texts.push({ tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0, 80), text: own.slice(0, 300), box: inkBox(el), element: box(el), font: font(el) });
      if (el.tagName === 'IMG' && images.length < 80) images.push({ src: el.currentSrc || el.src, alt: el.alt, box: box(el), natural: `${el.naturalWidth}x${el.naturalHeight}`, fit: getComputedStyle(el).objectFit });
      if (el.tagName.toUpperCase() === 'SVG' && images.length < 80) images.push({ svg: true, box: box(el), markup: el.outerHTML.slice(0, 1500) });
      const bg = getComputedStyle(el).backgroundImage;
      if (el !== sec && bg && bg !== 'none' && bg.includes('url(') && images.length < 80) images.push({ background: bg.slice(0, 300), box: box(el), size: getComputedStyle(el).backgroundSize });
      if (el.tagName === 'A' && links.length < 120) links.push({ text: el.textContent.trim().slice(0, 80), href: el.href });
    }
    // Layout children: skip single-child wrappers so a header's 3-column row or a grid's cards show up.
    let host = sec;
    for (let n = 0; n < 6 && kids(host).length === 1; n++) host = kids(host)[0];
    const grid = kids(host).slice(0, 12).map((k) => ({ tag: k.tagName.toLowerCase(), cls: String(k.className).slice(0, 80), box: box(k), layout: layout(k) }));
    // key: the nearest id on the section or an ancestor, stable across viewport widths (match sections by it).
    let keyEl = sec;
    while (keyEl && !keyEl.id && keyEl !== document.body) keyEl = keyEl.parentElement;
    const key = keyEl && keyEl.id && keyEl !== document.body ? keyEl.id : `${sec.tagName.toLowerCase()}.${String(sec.className).split(/\s+/)[0]}`;
    return { index: i, key, contentBox: host !== sec ? box(host) : undefined, contentLayout: host !== sec ? layout(host) : undefined, tag: sec.tagName.toLowerCase(), id: sec.id || undefined, cls: String(sec.className).slice(0, 120), box: box(sec), layout: layout(sec), children: grid, texts, images, links };
  };

  // Breakpoints declared in readable stylesheets (cross-origin sheets are skipped and counted).
  const bps = new Map();
  let unreadableSheets = 0;
  const scan = (rules) => {
    for (const r of rules) {
      if (r.media) for (const m of r.media.mediaText.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)) {
        const px = m[3] === 'px' ? +m[2] : +m[2] * 16;
        const key = `${m[1]}-width:${px}px`;
        bps.set(key, (bps.get(key) || 0) + 1);
      }
      if (r.cssRules) scan(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) { try { scan(sh.cssRules); } catch { unreadableSheets++; } }

  return ({
    url: location.href, viewport: { w: VW, h: window.innerHeight }, documentHeight: document.documentElement.scrollHeight,
    bodyFont: font(document.body), bodyBackground: getComputedStyle(document.body).backgroundColor,
    fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
    breakpoints: [...bps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} (${n})`), unreadableSheets,
    sections: sections.map(describe),
  });
})();
