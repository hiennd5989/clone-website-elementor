# Motion and animated pages

Use for sticky scenes, reveal animations, carousels, animated media, or any animation beyond simple hover transitions. Reproduce the rendered behavior with Elementor controls first, then `clone.css`, then `clone.js`. Never paste the source's minified bundles.

## Generated-site inspection (Framer, Webflow, Shopify themes, other builders)

Generators often render duplicate desktop/mobile variants and hide one with breakpoint classes. Read the **visible** layout and computed styles at each viewport instead of copying every node. Section names (`data-framer-name`, Webflow/Shopify section ids) identify sections. Generated classes are not architecture: give Elementor elements your own CSS classes, prefixed with the site slug.

Wait for hydration and entrance animations, and scroll through content below the fold. Capture initial and revealed positions when movement matters.

Use `currentSrc` at enough resolution for the largest rendered size, and the observed crop. CDN image URLs can return AVIF/WebP despite PNG filenames: verify the bytes. The site's image library must support the format to create intermediate sizes; if it doesn't, convert to a format it handles and note it.

Check each font's actual weight and style before declaring `@font-face`. SVGs uploaded to the Media Library need an SVG-upload capability. Elementor has an "Inline font icons / SVG" upload option; enabling it is a site-wide setting, so ask first. Otherwise inline the SVG in an HTML widget, or use the Icon widget with a matching icon set and disclose the substitution.

## Motion inspection

| Driver | Evidence | Elementor implementation (prefer top to bottom) |
| --- | --- | --- |
| Time | cycle, pause, direction, looping media | Video widget / background video; CSS keyframes in `clone.css` |
| Scroll reveal | entry boundary, start/end positions, reverse replay | *Entrance Animation* (Free, plays once, fixed presets); Pro *Motion Effects → Scrolling Effects*; else `IntersectionObserver` in `clone.js` toggling a class |
| Continuous scroll | progress, pin duration, layer speeds | Pro *Scrolling Effects* (translate/opacity/scale by viewport range) and *Sticky*; else `position: sticky` + scroll progress written to a CSS variable |
| Sticky header | offset, the scroll position where style changes, background/color change | Pro *Sticky* + "Effects Offset" (adds `elementor-sticky--effects`); Free: `position: sticky` in `clone.css` + a scroll listener toggling a class |
| Click/hover | alternate content, transition, dismissal/navigation | Widget hover controls (colors, transforms, `hover_animation`), Nested Tabs/Accordion (Free); Pro Popup/Off-canvas; else `aria-expanded` toggled by `clone.js` |
| Carousel | items per view per breakpoint, step size, snap, boundaries, drag/touch | Image Carousel (Free, images only); Pro Loop/Nested Carousel for rich slides; else a flex container with native `overflow-x: auto` + `scroll-snap`, arrows calling `scrollBy()` |
| Pointer/canvas | response, renderer/media identity | Pro Mouse Effects for simple tilt/track; else disclose an approximation |

Elementor's built-in sliders (Swiper) have their own step, speed, and easing. When the source paging differs (one full view per click, or a specific easing), a native scroll-snap row plus a small script matches it more closely than tuning Swiper.

Observe both directions and mobile. Match measurable easing and duration. Page-wide scripts (smooth scrolling such as Lenis, scroll snapping, page transitions) change every interaction; reproduce them only if they are part of the requested experience.

## clone.js conventions

- One IIFE per behavior. Find elements by the classes set in each element's *Advanced → CSS Classes* (Elementor wraps widgets, so query inside `.elementor-element.<class>`).
- Run on `DOMContentLoaded`, and stay safe when run twice: the editor preview re-renders widgets. Elementor fires `elementor/frontend/init`; in the editor (`body.elementor-editor-active`), skip behaviors that would fight editing, such as body scroll locks.
- Keep state in attributes (`aria-expanded`, `aria-hidden`, `inert`, `data-state`) so CSS can style it.
- Clean up listeners, observers, and timers when an element is removed. Lock and unlock body scroll symmetrically.
- Respect `prefers-reduced-motion` only where the source does. Never let reduced motion hide content.

## Verify the experience

Compare initial, active, and settled states at comparable positions. Test controls during motion, and navigate away and back to detect stuck states. Confirm motion does not widen the document or hide content permanently. Check the editor too: the page must remain editable with the behavior loaded.
