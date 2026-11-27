# Site access, inventory, and checks

The pages are built directly on a WordPress site with Elementor. Establish how you reach the site, inventory it, and keep checking it as you build.

## Reaching the site

Use the first option that works, and record which in the page brief:

| Access | How | Notes |
| --- | --- | --- |
| WP-CLI on a local site | `wp --path=<site>` (LocalWP site shell, XAMPP/Laragon, wp-env's `cli` container) | Best: every step is scriptable and repeatable. |
| WP-CLI over SSH | `wp --ssh=user@host/path` or `ssh … wp …` | Staging preferred. Ask before running anything on production. |
| No shell | Browser on wp-admin + Elementor's *Templates → Import* | Export each page as an Elementor template file (`{"content": [...], "page_settings": {...}, "version": "0.4", "title": "…", "type": "page"}`) and import it. Media must be uploaded first and IDs fixed by hand, so this is slow; say so. |

Never ask for passwords in chat if a safer route exists. Never write credentials into files. If the user gives an application password or SSH key path, use it only for this session.

Pass `--user=<administrator login>` to WP-CLI commands that save Elementor documents: Elementor refuses to save without a user who can edit the post.

### Running the scripts over SSH

The scripts and assets must sit on the server, because `wp eval-file` reads local paths there:

```bash
KEY=~/.ssh/<key-the-user-named>; HOST=root@<server>; WP=<WordPress root: find it with `ls /var/www /home`, never guess>
ssh -i $KEY -o IdentitiesOnly=yes $HOST "mkdir -p /root/clone-<slug>/assets"
scp -i $KEY -o IdentitiesOnly=yes -r scripts docs/research/<slug>/elementor $HOST:/root/clone-<slug>/
scp -i $KEY -o IdentitiesOnly=yes -r public/sites/<slug> $HOST:/root/clone-<slug>/assets/   # JSON refers to {"asset": "<slug>/…"}
ssh -i $KEY -o IdentitiesOnly=yes $HOST "cd /root/clone-<slug> && wp --path=$WP --allow-root db export /root/clone-<slug>/before.sql && \
  wp --path=$WP --allow-root --exec=\"define('FS_METHOD','direct');\" eval-file scripts/elementor-import.php assets elementor/<page>.json --user=<admin>"
```

- `--allow-root` is needed when the SSH user is root.
- Afterwards, `chown` the uploads to the web user (`stat -c %U $WP/wp-content/uploads`) so WordPress can still manage those files.
- Use only the SSH key the user names. Don't try keys one by one.
- **`wp` prints nothing and exits 0.** Some plugin is hitting a fatal error during load, and the site hides PHP errors.
  - Find it: `wp --skip-plugins eval 'echo 1;'` prints `1`; then skip plugins one at a time.
  - A common cause is the CLI's PHP lacking an extension that the web PHP has, for example `curl` with the Facebook Pixel plugins (`php -m` lists the extensions).
  - Fix: add `--skip-plugins=<those>` to every command. Never trust an empty result: it is a failure, not "no data".
- **A fatal `ftp_nlist()` error while saving or deleting a post as root.** The files belong to the web user (`nobody`, `www-data`), so WordPress picks the FTP filesystem, and a plugin hooked to the save (Rank Math's sitemap cache through LiteSpeed) crashes on it. Add `--exec="define('FS_METHOD','direct');"` to commands that save posts, menus or media.
- **Run `wp` with the web server's PHP, or the web keeps stale posts.** A persistent object cache (Redis/Memcached through LiteSpeed, W3TC, Redis Object Cache) only works where PHP has that extension. On LiteSpeed/CyberPanel hosts the shell's `php` usually lacks it while `lsphp` has it, so a plain `wp` saves to the database but cannot clear the web's cached copy: the preview keeps showing the old page, and a page published from the CLI still answers 404 with a redirect to `?page_id=`. Check `wp eval 'var_dump(wp_using_ext_object_cache());'` against the site's `object-cache.php` drop-in. If they disagree, run WP-CLI through the web PHP (`/usr/local/lsws/lsphp83/bin/php $(which wp) …`, matching the site's PHP version) for every import, publish and meta change. Repair an already stale page with `wp eval 'clean_post_cache(<id>);'` through that PHP. Never judge a result from a preview made after a CLI save that did not reach the cache.
- **Sharing a page before launch.** Publish it with a post password (`wp post update <id> --post_status=publish --post_password=<pw>`), set it noindex (Rank Math: `rank_math_robots` = `["noindex","nofollow"]`), and keep the page out of the page cache: LiteSpeed serves its cached password form even to visitors who entered the password. Use the per-page *Disable Cache* meta (`wp post meta update <id> litespeed_no_cache 1`, then `wp litespeed-purge post_id <id>`), not a site-wide exclusion. Re-imports must then carry `"status": "publish"`, or they unpublish it. Never put the password in the build files.
- **Page caches.** Drafts aren't cached, so a draft clone needs no purge. Saving menus or clearing Elementor's CSS can make LiteSpeed or WP Rocket purge the whole site ("Dọn dẹp tất cả các bộ nhớ cache" / "Purged all caches" in the output). The importer avoids both unless the kit changes. If a purge does happen on a live store, mention it in the report.

### A disposable local site for testing

When the user has no site yet, or you want to rehearse before touching theirs, run WordPress Playground (needs Node only; PHP runs in WebAssembly):

```
# 1. First boot: install into a host folder so the site persists between runs.
npx @wp-playground/cli@latest server --mount-dir-before-install <site-dir> /wordpress \
  --wordpress-install-mode download-and-install --blueprint setup.json --login --port 9400

# 2. Later boots reuse the files.
npx @wp-playground/cli@latest server --mount-dir-before-install <site-dir> /wordpress \
  --wordpress-install-mode install-from-existing-files --login --port 9400

# 3. WP-CLI and scripts: run PHP against the same folder (download wp-cli.phar once).
npx @wp-playground/cli@latest php --mount-dir <site-dir> /wordpress --mount-dir <work-dir> /work \
  --wordpress-install-mode do-not-attempt-installing -- /work/wp-cli.phar --path=/wordpress <command>
```

`setup.json` (a Playground blueprint) installs the plugins and the theme the user's real site uses:

```json
{
  "steps": [
    { "step": "installPlugin", "pluginData": { "resource": "wordpress.org/plugins", "slug": "elementor" }, "options": { "activate": true } },
    { "step": "installTheme", "themeData": { "resource": "wordpress.org/themes", "slug": "hello-elementor" }, "options": { "activate": true } },
    { "step": "defineWpConfigConsts", "consts": { "WP_DEBUG": true, "WP_DEBUG_LOG": true, "WP_DEBUG_DISPLAY": false } },
    { "step": "setSiteOptions", "options": { "permalink_structure": "/%postname%/" } }
  ]
}
```

On Windows, use `--mount-dir "<host>" "<vfs>"` (two arguments) rather than `--mount host:vfs`: the drive-letter colon breaks the single-argument form. Avoid writing to the database from WP-CLI while the server handles a request, because both processes share one SQLite file. Run imports between page loads, not during them. Check flags with `--help`; this CLI changes often.

wp-env (`npx @wordpress/env start`, needs Docker), LocalWP, XAMPP, and Laragon work too. Use whichever the machine already has. Ask before installing system software.

## Inventory (step 1)

Run `wp eval-file scripts/elementor-controls.php` (no arguments). It prints:

- WordPress, PHP, and the theme (and parent);
- Elementor and Elementor Pro versions, WooCommerce;
- page templates, active experiments (container, nested elements, additional breakpoints);
- breakpoints, the kit ID, the default color/font options, and the registered widgets.

Then, for each element type the section plan uses:

```
wp eval-file scripts/elementor-controls.php container heading image button html icon text-editor
wp eval-file scripts/elementor-controls.php kit page
```

Save the output in `docs/research/<site-slug>/elementor/controls/`. Write settings using those keys and the value shapes shown in each control's `default`.

Also list what already exists so nothing is overwritten:

- `wp post list --post_type=page,elementor_library --fields=ID,post_name,post_status`
- `wp menu list`
- `wp option get elementor_active_kit`, then `wp post meta get <kit> _elementor_page_settings --format=json` (current kit values to merge beside, not replace).

## Backups and site-wide changes

Before changing the kit, breakpoints, Elementor options, menus, or the Customizer on a site with other content:

- `wp db export <file>.sql`, or confirm the host's backup.
- Record the previous values in the page brief so each change can be reverted.
- Changing breakpoints or default fonts restyles **every** Elementor page on the site. Ask first, or keep the source's sizes local to the cloned pages.

## Checks while building

- **Import output:** no "not registered" widget warnings, unless that section deliberately falls back.
- **Editor:** open each page's edit link. It loads without "preview could not be loaded", the Navigator shows the expected tree, and each widget's panel shows the values you set (a wrong key silently shows the default).
- **Front end, logged out (private window):** every page returns 200, and the console is clean. No failed requests and no requests to the source origin for assets. No horizontal overflow.
- **CSS freshness:** after kit or breakpoint changes, run `wp elementor flush-css`, or run the import again, which clears the cache.
- **PHP debug log:** with `WP_DEBUG_LOG` on, no new notices from the import scripts or Elementor while rendering the pages.
- **PHP syntax of the bundled scripts:** if you change them, lint them with `php -l` (any PHP CLI, including the Playground `php` command).
