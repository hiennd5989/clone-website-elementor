---
name: clone-website-elementor
description: Rebuild existing web pages with Elementor on a WordPress site that already has a theme, matching the source's real content, assets, responsive layout, and interactions, with the result editable in the Elementor editor. Works with Elementor Free or Pro and with whatever theme is active. Use for cloning, replicating, or reverse engineering a website into Elementor pages.
---

# Clone a website with Elementor

Recreate the supplied pages as **Elementor pages on the user's WordPress site**, on top of the theme already installed there. Match the source before adding a new design direction. Deliver pages the user can open and edit in Elementor. Screenshots, iframes, and pasted source HTML are references, not the implementation.

Hard rules:

- **A clone needs a source, and copies it.** Start only from source URLs the user gave. Without one, stop and ask for it. Never design a page, invent a layout, write copy, or substitute the destination site's own content: every section, text, image, color, and measurement comes from the source and the extraction files of step 2. A "test page" or "sample in our brand" is not this skill; say so and ask.
- **Done means compared.** Don't report a page as finished until the comparison of step 4 exists: source and result screenshots at the same widths, section by section, with each difference listed. A page nobody compared is a draft, and must be reported as one.
- **Don't create or edit a theme.** Work with the active theme as installed. Theme files are overwritten by updates, so no PHP is added there. Adjust only the theme's own settings (Customizer, theme options) when that is the cleanest way to neutralize something, and record each change.
- **Native widgets first.** Text, images, buttons, links, and layout go into Elementor widgets and containers so they are editable in the editor. Use an HTML widget only for behavior no available widget provides: a custom carousel control, a drawer, a form without a backend. Keep the editable content outside it whenever possible.
- **Free unless Pro is present.** Detect Elementor Pro and other add-ons. Use a Pro feature only when it is active. Never install, activate, or license plugins without the user's approval.
- **Protect the existing site.** Ask before working on a production site; prefer local or staging. Never overwrite or delete existing pages, templates, menus, or global kit values without confirmation. Create new pages as drafts, add new kit colors/fonts beside the existing ones, and take a backup (`wp db export`) before changing site-wide settings.
- **Never hotlink the source.** Import every asset into the Media Library.

Read [Elementor build reference](references/elementor-build.md) before building, and [Site access and checks](references/site-access.md) before step 1 ends.

## 1. Map the work

Read project instructions. Open the source URLs with the available browser. Prefer direct HTTP, asset tools, or APIs for extraction when practical; use the browser to establish appearance and behavior. Some sites block plain HTTP clients while their CDNs serve assets normally.

Establish site access and inventory the site before planning. Details are in [Site access](references/site-access.md):

- How you reach it: WP-CLI locally, WP-CLI over SSH, or (last resort) the browser plus Elementor's template import.
- WordPress, PHP, the active theme (and parent), and Elementor and Elementor Pro versions.
- Other page-builder add-ons and WooCommerce.
- Active Elementor features (flexbox/grid containers, nested elements, additional breakpoints), the active kit's breakpoints, colors, and typography.
- Existing pages and menus.
- Whether the theme supports Elementor's Theme Builder locations, and which page templates it offers.

Then dump the control names of the widgets you will use with `scripts/elementor-controls.php`. Elementor's settings keys change between versions; never guess them.

Record a short **source-to-site route map**. For each source URL, record:

- the page slug and parent (preserving source paths);
- the page template (`elementor_canvas` = no theme header/footer, `elementor_header_footer` = theme header/footer + full-width content, or a theme template);
- where the header and footer come from (see "Header and footer" in the build reference);
- out-of-scope links, which keep pointing to the source.

A locale-prefixed home page (`/vi-vn`) becomes a page with that slug. Ask before making it the site's front page or adding redirects on an existing site. Match the source's trailing-slash convention only if the site's permalink structure can change safely.

Existing clones of the same source (for example a previous rebuild with a page brief, screenshots, and an asset map) are useful starting points. Reuse their evidence, then spot-check the live source for changes.

Finish when every requested URL has a destination page, template, and header/footer strategy, and the Free/Pro path for each section is decided.

## 2. Observe before building

Inspect the whole page at desktop and mobile widths. Scroll top to bottom to load lazy media and reveal sticky/pinned scenes. Then exercise menus, tabs, accordions, carousels, hover states, forms, and primary links. Distinguish changes driven by **scroll, click, hover, or time**; a click imitation of a scroll-driven section is a different product.

Treat each observation as one sample of a **rule**. Read declared values (computed styles, CSS variables, a library's live options) rather than inferring them from one rendering. Vary viewport width (including wider than the design), viewport height, input, and state until you know what drives each change. Fluid sizes usually come from `clamp()`/`vw` formulas: measure at three or more widths and derive the formula. List every **breakpoint** the source uses; they decide the Elementor breakpoint setup. Drive the page with the inputs visitors use (wheel, touch, keyboard, pointer).

**Extract, don't eyeball.** At 1440 and 390 px wide, scroll the source page to the bottom so lazy content loads, then run `scripts/extract-source.js` in the page with the browser's script tool. Save each result as `docs/research/<site-slug>/extract-<width>.json`. It returns:

- the stylesheet breakpoints, with how often each is used;
- the section stack, top to bottom;
- for each section: a `key` that stays the same across widths, its box, its layout (flex/grid, columns, gaps, padding, background), its children's boxes (skipping single-child wrappers), every text with its glyph box and typography, every image and background image, and every link.

Build from these files. Every section in the build plan names the extract section it reproduces, and every text and image in the page JSON exists in an extract file. Take a full-page screenshot at both widths too, and one per section when the page is long.

Save source screenshots labeled with viewport, scroll position, and interaction state. Keep one compact page brief in `docs/research/<site-slug>/README.md`. It covers:

- the route map and the site inventory;
- section order, typography, colors, layout measurements, and breakpoints;
- the asset mapping and the interactions;
- a **section plan**: for each section, which widgets or containers build it, and which part, if any, needs custom CSS or an HTML widget.

Read [the inspection reference](references/inspection-guide.md) for extraction and state comparison. For **sticky scenes, reveal animations, carousels, or animated media**, read [Motion](references/motion.md).

Use the source's real text and the files it actually loads: fonts, images, SVGs, and video. Measure important geometry and computed styles. Track source URL → local file → Media Library ID, and verify content type and dimensions: a `.png` URL may return AVIF or WebP.

Finish when every section and meaningful state has enough evidence to build, with unavailable details identified.

## 3. Build a complete first pass

Write the build as files first, then apply them to the site with the import script. The files are the reviewable, re-runnable source of truth:

```
docs/research/<site-slug>/elementor/
  kit.json            # breakpoints, colors, typography to add (merged, never replacing existing values)
  <page>.json         # page meta, page settings, and the element tree
  clone.css           # CSS that no control can express (hover swaps, fluid type, theme neutralizing)
  clone.js            # behavior that no widget provides
assets/<site-slug>/    # downloaded media, referenced from the JSON as {"asset": "<relative path>"}
```

Order:

1. **Prerequisites.** Confirm plugin and feature availability. Ask the user before enabling Elementor features or changing global settings on a site that has other content.
2. **Global layer.** Set breakpoints matching the source. Add the source colors and fonts as kit custom colors and typography. Turn off Elementor's default Google fonts if the source uses system or local fonts. Then check that the theme's own styles don't leak into the page: link colors, heading margins, button styles, body font, container widths.
3. **Header and footer** with every observed state: hover, open, sticky, colored-on-scroll, and the mobile drawer.
4. **Sections** in source order, from containers and native widgets with real content. Set responsive values per breakpoint on the controls themselves; use `clone.css` only for what controls can't express. Wrap the whole page in one root container with a class (`<slug>-page`) and scope every `clone.css` rule to it. On a site with other pages, don't touch the kit: keep its breakpoints and put the source's other breakpoints in `clone.css`. Responsive defaults apply even when unset: grids become 1 column on mobile (see the build reference).
5. **Behavior** in `clone.js`: a menu drawer, carousel arrows, a sticky-header color change. Load it the way the site's tier allows: Pro Custom Code, else one HTML widget per page. Use vanilla JS, safe to run twice, bound to classes set in each element's *CSS Classes* field.
6. **Apply and re-apply.** Run `wp eval-file scripts/elementor-import.php …` (as an admin user). It imports media, merges the kit, saves the page through Elementor's document API, and regenerates CSS. The import script is idempotent: rerun it after every file change instead of hand-editing in the editor, until the user takes over editing.

Recreate in-scope interactions. Preserve real outbound destinations; leave out-of-scope destinations pointing to the source and disclose them. Visible controls must perform the behavior they promise. A form without a backend must say so after submit and never pretend to succeed. Use Elementor Pro's Form widget only if the user gives it a destination.

Finish this pass when every requested page renders on the site with real assets, opens without errors in the Elementor editor, and important controls work.

## 4. Compare, repair, repeat

**Getting the result on screen.** A draft or private page shows "not found" to a browser that is not logged in. Don't publish it to look at it. Render it on the server instead:

```
wp eval-file scripts/render-page.php <page-id> --user=<admin> > page.html
```

The rendered page has no admin bar, and its CSS, fonts and images load from the site by absolute URL. Open `page.html` in the browser (`file://…`), scroll so lazy images load, and screenshot it at the same widths as the source. Re-render after every import.

**The comparison table** goes into the page brief and the final report. It has one row per extract section, at 1440 and at 390. Each row gives:

- the source screenshot and the result screenshot;
- a verdict: match, or the list of differences (position, size, font, color, spacing, missing or extra content).

**Compare by numbers.** Run `scripts/extract-source.js` on the rendered result at each width, then:

```
node scripts/compare-extracts.mjs docs/research/<slug>/extract-1440.json docs/research/<slug>/result-extract-1440.json > docs/research/<slug>/compare-1440.md
```

It lists, against the source:

- section tops and heights;
- every text whose glyph box, font, weight, line height, color or transform differs;
- texts missing from the result or added to it.

Fix, re-import, re-render, and re-run it until only differences you can explain remain. Numbers catch what eyes miss: a theme rule forcing every heading to weight 500, a grid that went to one column on mobile, a 3px card padding. Put each width's report in the page brief.

- **Measure the source and the result in the same browser tab with the same emulation**, one after the other. Tabs that ever emulated a phone use overlay scrollbars, others don't, and a 15px scrollbar shifts every width.
- **Re-extract the source in the same session as the result.** Live sites change: here a language selector appeared in the footer between two captures. When the source changed, the clone follows the current source.
- The rendered page is opened from `file://`, so the theme's icon fonts and AJAX calls fail on CORS. Elementor's own front-end JS config is not printed by a WP-CLI render either. Judge widgets that need Elementor's JS (its carousels, motion effects) on a real preview.

Compare **logged out**: the admin bar shifts sticky elements and Elementor adds editor-only markup when logged in. Open source and site pages at the **same viewport, scroll position, and state**. Let fonts, media, and reveal animations settle. Review the whole page wherever step 2 found a rule changing, plus a viewport wider than the design. Judge scroll and pointer behavior with real input. A side-by-side montage locates drift; full-size sections establish detail.

Fix the largest visible differences first: geometry, missing sections or layers, typography and wrapping, asset crop, then spacing and motion. Elementor-specific drift to check:

- container default padding and gap, and boxed widths;
- widget default margins (`.elementor-widget:not(:last-child)` spacing in some versions);
- default kit fonts and colors leaking in;
- theme styles on `a`, `h1–h6`, `button`, and `img`;
- the image widget's `max-width`;
- breakpoints off by one pixel (Elementor values are max-widths);
- stale generated CSS (run `wp elementor flush-css`).

Exercise the real workflow: navigation, the mobile menu, tabs and accordions, carousel boundaries, forms, and media. Check console errors, missing assets, and horizontal overflow. Then prove editability: open the page in Elementor, change one heading, one image, and one button link, update, and confirm they render.

Completion requires the page to load cleanly in the editor, a clean console, **and** a rendered comparison. State remaining differences precisely instead of calling an unchecked result pixel-perfect.

## Deliver

Return:

- Page URLs on the site, plus their edit links in Elementor.
- The site inventory: theme, Elementor/Pro versions, add-ons used.
- Every site-wide change made (kit, breakpoints, settings, Customizer, menus), with how to revert it.
- The route map.
- What is editable in the editor, and what lives in `clone.css` / `clone.js`.
- The comparison table of step 4 (desktop and mobile), with each remaining difference.
- Checks actually run, and remaining gaps.

Remind the user that a third-party site's branding, imagery, and copy belong to its owner: replace them before any public deployment.
