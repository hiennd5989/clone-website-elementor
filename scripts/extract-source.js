// Run in the SOURCE page's browser context (DevTools evaluate / the browser tool's "run script").
// Paste the whole file as one expression, or wrap it: (() => { ...file... })().
// Returns an object (in the DevTools console, wrap the call in copy(...) to copy it as JSON) with the page's breakpoints, section stack, and, per section, its geometry, layout styles,
// texts with typography, images, and links; every visible control (link, button, field) with its colors, border,
// effective opacity and transition time; the floating layer (fixed/sticky boxes: chat bubbles, signup teasers, cookie
// bars, back-to-top); third-party widget scripts (even when their UI did not render); and the :hover / open-state
// rules with the keyframes they use. Save the result as
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
  // Opacity as seen: the product of the element's and its ancestors' opacity (a list dimmed to 0.7 dims every link).
  const effOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    return Math.round(o * 100) / 100;
  };
  const font = (el) => {
    const s = getComputedStyle(el);
    return {
      opacity: effOpacity(el),
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

  // Controls: what a visitor can hover, click or type in. "motion" is the longest transition on the control or its
  // descendants (sources often animate an inner span), so a clone that lost its transitions shows 0s here.
  const ms = (v) => Math.max(0, ...v.split(',').map((t) => parseFloat(t) * (t.trim().endsWith('ms') ? 1 : 1000) || 0));
  const motionOf = (el) => {
    let best = { ms: 0, props: '' };
    for (const e of [el, ...el.querySelectorAll('*')].slice(0, 40)) {
      const st = getComputedStyle(e);
      const t = ms(st.transitionDuration) + ms(st.transitionDelay);
      if (t > best.ms) best = { ms: t, props: st.transitionProperty.slice(0, 80) };
    }
    return best;
  };
  const labelOf = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const controls = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]')) {
    if (controls.length >= 300 || !visible(el)) continue;
    const st = getComputedStyle(el);
    controls.push({
      tag: el.tagName.toLowerCase(), label: labelOf(el), box: box(el), opacity: effOpacity(el),
      background: st.backgroundColor, color: st.color,
      border: st.borderTopWidth !== '0px' ? `${st.borderTopWidth} ${st.borderTopStyle} ${st.borderTopColor}` : 'none',
      radius: st.borderRadius, motion: motionOf(el),
    });
  }

  // Floating layer: fixed/sticky boxes on screen that are not the page itself. Their box is in viewport coordinates.
  const floating = [];
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (st.position !== 'fixed' || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= VW) continue;
    if (r.width >= VW * 0.9 && r.height >= innerHeight * 0.5) continue; // a page-size layer (modal backdrop, sticky wrapper)
    if (floating.some((f) => f.el.contains(el))) continue;
    floating.push({ el, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), label: labelOf(el), box: { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }, zIndex: st.zIndex, transform: st.transform !== 'none' ? st.transform : undefined, iframe: el.tagName === 'IFRAME' ? el.src.slice(0, 120) : undefined });
  }
  floating.forEach((f) => delete f.el);

  // Third-party widgets (chat, signup popups, reviews, consent). Many refuse to render in an automation-controlled
  // browser (navigator.webdriver), so the script being present is the evidence: ask the user for a screenshot.
  const VENDORS = /tidio|klaviyo|intercom|zendesk|zopim|crisp\.chat|tawk|livechat|hubspot|drift\.com|gorgias|smartsupp|olark|freshchat|chatwoot|messenger|customerchat|zalo|privy|omnisend|justuno|optinmonster|sumo\.com|mailchimp|onesignal|cookiebot|onetrust|judge\.me|yotpo|okendo|trustpilot|recaptcha/i;
  const thirdParty = [...new Set([...document.querySelectorAll('script[src], iframe[src]')].map((e) => e.src).filter((u) => VENDORS.test(u)).map((u) => { try { const x = new URL(u); return x.hostname + x.pathname.slice(0, 40); } catch { return u.slice(0, 80); } }))];

  // State rules: what changes on :hover / :focus-visible / open / expanded / active, and the keyframes they run.
  // "matches" counts visible elements matching the rule without its state, so dead rules drop out.
  const STATE = /:hover|:focus-visible|:focus-within|\.(?:open|is-open|opened|active|is-active|expanded)\b|\[aria-expanded=["']?true["']?\]|\[open\]/;
  const stripState = (sel) => sel.replace(/:hover|:focus-visible|:focus-within|:focus\b/g, '').replace(/\.(?:open|is-open|opened|active|is-active|expanded)\b/g, '').replace(/\[aria-expanded=["']?true["']?\]|\[open\]/g, '').replace(/:not\(\s*\)/g, '').replace(/(^|[\s>+~,(])(?=[\s>+~,)]|$)/g, '$1*');
  const stateRules = [];
  const keyframes = {};
  const animNames = new Set();
  const visit = (rules, media) => {
    for (const r of rules) {
      if (r.type === CSSRule.KEYFRAMES_RULE) { keyframes[r.name] = r.cssText.replace(/\s+/g, ' ').slice(0, 600); continue; }
      if (r.cssRules && !r.selectorText) { visit(r.cssRules, r.conditionText || (r.media && r.media.mediaText) || media); continue; }
      if (!r.selectorText || !STATE.test(r.selectorText) || stateRules.length >= 250) continue;
      let matches = 0;
      for (const part of r.selectorText.split(',')) {
        if (!STATE.test(part)) continue;
        try { matches += [...document.querySelectorAll(stripState(part.trim()))].filter(visible).length; } catch { /* selector the browser can't take apart */ }
      }
      if (!matches) continue;
      // A shorthand holding var() serializes as empty longhands ("animation-name: ;"): read the shorthand itself.
      let decl = r.style.cssText.replace(/\s*[a-z-]+: ;/g, '');
      for (const sh of ['animation', 'transition']) {
        const v = r.style.getPropertyValue(sh);
        if (v && !decl.includes(`${sh}:`)) decl += ` ${sh}: ${v};`;
      }
      for (const m of decl.matchAll(/animation(?:-name)?:\s*([^;]+)/g)) m[1].split(/[\s,]+/).forEach((n) => animNames.add(n));
      stateRules.push({ selector: r.selectorText.slice(0, 300), media: media || undefined, declarations: decl.slice(0, 400), matches });
    }
  };
  for (const sh of document.styleSheets) { try { visit(sh.cssRules, ''); } catch { /* cross-origin */ } }
  const usedKeyframes = Object.fromEntries(Object.entries(keyframes).filter(([n]) => animNames.has(n)));

  return ({
    url: location.href, viewport: { w: VW, h: window.innerHeight }, documentHeight: document.documentElement.scrollHeight,
    bodyFont: font(document.body), bodyBackground: getComputedStyle(document.body).backgroundColor,
    fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`),
    breakpoints: [...bps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} (${n})`), unreadableSheets,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    sections: sections.map(describe),
    controls, floating, thirdParty, stateRules, keyframes: usedKeyframes,
  });
})();
