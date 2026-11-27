# Elementor build reference

Verified against Elementor 4.4.2 (Free and Pro). Before writing settings for another version, dump that version's real control keys with `scripts/elementor-controls.php` and trust the dump over this file.

## Files and import

```
docs/research/<site-slug>/elementor/
  kit.json          # optional: site-wide options and kit values (needs the user's consent on a live site)
  <page>.json       # one file per page: page fields, page settings, elements
  clone.css         # CSS the native controls cannot express
  clone.js          # behaviour (drawer, carousel arrows, toggles)
  controls/         # JSON dumps from elementor-controls.php
```

Apply with:

```
wp eval-file scripts/elementor-import.php <assets-dir> kit.json <page>.json --user=<admin-login>
```

`--user` is required. Without a user, Elementor strips unfiltered HTML and refuses some saves. The importer does the following:

- **Media.** Uploads local assets once each. They are tracked by `_clone_source` meta, so re-running does not duplicate them.
- **Menus.** Creates and refreshes the menus that it created itself, and refuses to touch any other menu.
- **Placeholders.** Resolves these before saving:
  - `{{file:clone.css}}` becomes the file's contents.
  - `{{asset:img/x.jpg}}` becomes the uploaded URL.
  - `{{menu:key}}` becomes the menu ID.
  - `{"asset":"img/x.jpg","alt":"…"}` becomes an Elementor media value.
- **Element IDs.** Gives elements stable IDs, so a re-import updates the page in place.
- **Saving.** Saves through Elementor's Document API, which writes `_elementor_data`, regenerates the CSS file and sets edit mode.

## Page JSON shape

```json
{
  "menus": { "primary": { "name": "Clone – Primary", "items": [ { "title": "Shop", "url": "/shop", "children": [] } ] } },
  "page": { "path": "clone-test", "title": "Clone test", "status": "draft", "template": "elementor_canvas" },
  "settings": { "hide_title": "yes" },
  "elements": [ { "elType": "container", "key": "header", "settings": {}, "elements": [] } ]
}
```

- **`key`** is a stable name that the importer hashes into the element ID. Keys must be unique on the page.
- **`status`** stays `draft` (or `private`) until the user approves publishing.
- **`template`**:
  - `elementor_canvas` gives a blank page with no theme header or footer.
  - `elementor_header_footer` keeps the theme's header and footer.
  - `default` keeps the theme layout.
  - Choose from the strategy decided in step 1.

## Value shapes

| Control | Shape |
|---|---|
| Dimensions (`padding`, `margin`, `_margin`) | `{"unit":"px","top":"0","right":"0","bottom":"0","left":"0","isLinked":true}` |
| Slider (`font_size`, `min_height`, `width`) | `{"unit":"px","size":16,"sizes":[]}` |
| Custom unit | `{"unit":"custom","size":"clamp(20px, 3vw, 40px)","sizes":[]}`; `calc()`, `clamp()`, `min()`, `var()` all work |
| Gaps (`flex_gap`, `grid_gaps`) | `{"row":"12","column":"12","isLinked":true,"unit":"px"}` |
| Media | `{"id":123,"url":"https://…"}` |
| Link | `{"url":"/path","is_external":"","nofollow":""}` |
| Colour | `"#282828"` or a global: put `"__globals__":{"title_color":"globals/colors?id=ms_text"}` in settings |

Responsive values are separate keys with a suffix: `padding_tablet`, `padding_mobile_extra`, `padding_mobile`, and so on. A suffix only produces CSS when that breakpoint is active in the kit.

## Breakpoints

Breakpoints are stored as max-width values in the kit:

| Kit key | Default |
|---|---|
| `viewport_mobile` | 767 |
| `viewport_tablet` | 1024 |

Extra breakpoints such as `viewport_mobile_extra` and `viewport_laptop` exist but must also be listed in `active_breakpoints`.

Changing breakpoints changes **every** Elementor page on the site. On a site that already has pages, leave the kit alone. Use the nearest existing breakpoint and put the exact source breakpoints in `clone.css` as `@media` rules scoped to the page.

## Containers

- Set `content_width` to `full` or `boxed`, and `container_type` to `flex` or `grid`.
- Set `flex_direction` (`row`, `column`), `flex_wrap`, `justify_content` and `align_items`.
- Grid layouts use `grid_columns_grid` / `grid_rows_grid`, which take `{"unit":"custom","size":"repeat(3, minmax(0,1fr))"}`.
- A container becomes a link with `"html_tag":"a"` plus a `link` value.
- Backgrounds use:
  - `background_background: "classic"`
  - `background_image` and `background_image_mobile`
  - `background_size`, `background_position`
- `css_classes` holds the container's classes. Widgets use **`_css_classes`**, with a leading underscore.
- The kit sets container padding to 10px and widget spacing to 20px by default. Write `padding` and `flex_gap` (both 0) explicitly on every container that should be tight, instead of changing the kit.
- Top-level containers get the `e-parent` class. Nested ones need `"isInner": true`; the importer sets this.

## Widgets (classic)

| Widget | Main keys |
|---|---|
| `heading` | `title`, `header_size` (h1–h6, div, span, p), `link`, `align`, `title_color`, `typography_*` |
| `text-editor` | `editor` (HTML), `text_color`, `typography_*` |
| `image` | `image`, `image_size` (`full`), `width`, `link_to`, `link` |
| `button` | `text`, `link`, `button_text_color`, `background_color`, `border_*` |
| `divider` | `color`, `weight`, `gap` |
| `html` | `html` (raw HTML; use only for behaviour or markup no widget can produce) |
| `wp-widget-nav_menu` | `{"wp":{"title":"","nav_menu":"{{menu:primary}}"}}` (Free-friendly menu) |
| `nav-menu` | Pro only: `menu` (slug), `layout`, `toggle`, `dropdown` |

Typography needs `typography_typography: "custom"` before the other `typography_*` keys (font_family, font_size, font_weight, line_height, letter_spacing, text_transform) take effect.

## Free vs Pro

The inventory lists widgets under three headings:

- `pro_locked`: registered on Free only as promotions. Using one on Free renders nothing, and the importer warns about it.
- `classic`: usable widgets.
- `atomic_v4`: V4 atomic widgets. They use a different data model; don't use them unless the user asks.

Some features are Pro only:

- the `custom_css` control on elements and pages;
- Theme Builder header and footer;
- the Nav Menu, Form, Loop and Carousel widgets;
- Motion Effects and Sticky.

On Free:

- Put CSS and JS in one HTML widget at the start of the page and one at the end: `<style>{{file:clone.css}}</style>` and `<script>{{file:clone.js}}</script>`.
- Build menus with `wp-widget-nav_menu` and style them from `clone.css`.

On Pro, `custom_css` in the page settings is cleaner for CSS. Behaviour JS still goes in an HTML widget.

## CSS that clone.css usually needs

- **Prefix every rule** with a page class, such as `body.page-id-<id>` or a root container class like `.ms-page`, so nothing leaks into the rest of the site.
- **Reset the theme's styles inside the clone.** Hello Elementor and most themes style `a` with a colour, `button`/`input` with borders and padding, and heading margins.
- **Specificity.** Elementor's own selectors look like `.elementor-<postId> .elementor-element.elementor-element-<id>`. Beat them with your class chain plus `.elementor-element` rather than with `!important`.
- **Full-bleed on `elementor_canvas`:** `.elementor > .e-con { width: 100%; max-width: none; }`.
- **Horizontal tracks:** use `overflow-x: auto; scroll-snap-type: x mandatory;` on the row container, with arrows from `clone.js` scrolling it by one card width.

## Kit (site-wide) values

The importer merges these, and only when `kit.json` is passed:

- `custom_colors` / `custom_typography`, upserted by `_id`;
- `body_typography_*`, `body_color`, `container_padding`, `space_between_widgets`, breakpoints.

Options are limited to `elementor_*` keys. Examples:

- `elementor_google_font: "0"` stops Google Fonts loading.
- `elementor_disable_color_schemes` / `elementor_disable_typography_schemes`.

All of these affect the whole site. On a live site, ask first and take `wp db export` before applying a kit.

## Pitfalls seen in testing

- **Style-tab controls are missing outside the editor.** `get_controls()` omits them unless `\Elementor\Core\Frontend\Performance::set_use_style_controls(true)` is called first. Both scripts do this.
- **`Document::save()` doesn't set edit mode.** It does not mark the page as built with Elementor, so the front end shows only `post_content`. Call `$document->set_is_built_with_elementor(true)` before saving (the importer does).
- **CSS is cached.** After an import, run `\Elementor\Plugin::$instance->files_manager->clear_cache()` (the importer does), then purge any page cache such as LiteSpeed or WP Rocket.
- **Lazy-loaded backgrounds on the first viewport.** Elementor lazy-loads top-level container backgrounds. For a hero that must paint at once, disable lazy load in Elementor → Settings → Performance, or set the image in `clone.css`.
- **Always compare logged out.** Logged in, the admin bar shifts sticky headers by 32px.
