<?php
/**
 * Apply clone build files to the site through Elementor's document API. Idempotent.
 *
 *   wp eval-file elementor-import.php <assets-dir> <file.json> [<file.json> …] --user=<admin>
 *
 * A build file may contain:
 *   "options": { "elementor_…": value }        Elementor options (only keys starting with elementor_).
 *   "kit":     { settings }                    Merged into the active kit. custom_colors and
 *                                              custom_typography are upserted by _id; other keys are set.
 *   "menus":   { "<key>": { "name": "Menu name", "items": [ { "label", "url", "target", "children": [...] } ] } }
 *                                              WordPress menus owned by the clone (tagged with term meta
 *                                              _clone_source). Items are rebuilt on every run. A menu with
 *                                              the same name that the clone did not create is never touched.
 *   "page":    { "path": "parent/slug", "title": "…", "status": "draft", "template": "elementor_canvas" }
 *   "settings": { page settings }              Elementor page settings (hide_title, background, …).
 *   "elements": [ element tree ]               Containers/widgets as Elementor stores them.
 *
 * Placeholders resolved anywhere in the file:
 *   { "asset": "dir/file.png", "alt": "…" }  → Media Library image { id, url, alt, source }
 *   "{{asset:dir/file.png}}"                 → that attachment's URL
 *   "{{file:clone.css}}"                     → contents of a file next to the JSON (placeholders inside
 *                                              it are resolved too, e.g. {{asset:…}} in CSS)
 *   "{{menu:<key>}}"                         → ID of a menu from "menus" (for the WordPress Menu widget)
 * Elements without an "id" get a stable one derived from the file and position.
 */

if ( ! defined( 'WP_CLI' ) || ! did_action( 'elementor/loaded' ) ) {
	WP_CLI::error( 'Run with WP-CLI on a site where Elementor is active.' );
}
if ( count( $args ) < 2 ) {
	WP_CLI::error( 'Usage: wp eval-file elementor-import.php <assets-dir> <file.json> [...] --user=<admin>' );
}
if ( ! current_user_can( 'edit_pages' ) ) {
	WP_CLI::error( 'Pass --user=<administrator> so Elementor allows saving.' );
}

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$clone_assets_dir = rtrim( str_replace( '\\', '/', array_shift( $args ) ), '/' );
$clone_plugin     = \Elementor\Plugin::$instance;

// Outside the editor, Elementor hides Style-tab controls from get_controls(); saving and CSS
// generation need the full set, otherwise style settings can be dropped or not rendered.
if ( class_exists( '\Elementor\Core\Frontend\Performance' ) ) {
	\Elementor\Core\Frontend\Performance::set_use_style_controls( true );
}
$clone_widgets    = array();
foreach ( $clone_plugin->widgets_manager->get_widget_types() as $clone_widget_name => $clone_widget ) {
	// Free registers Pro widgets as locked promotions: they render nothing on the front end.
	if ( ! is_a( $clone_widget, 'Elementor\Modules\Promotions\Widgets\Pro_Widget_Promotion' ) ) {
		$clone_widgets[] = $clone_widget_name;
	}
}

function clone_import_media( $relative, $alt, $assets_dir ) {
	static $cache = array();
	$relative = ltrim( str_replace( '\\', '/', $relative ), '/' );
	if ( isset( $cache[ $relative ] ) ) {
		return $cache[ $relative ];
	}
	$found = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'meta_key' => '_clone_source', 'meta_value' => $relative, 'fields' => 'ids', 'numberposts' => 1 ) );
	if ( $found ) {
		$id = (int) $found[0];
	} else {
		$path = "{$assets_dir}/{$relative}";
		if ( ! is_readable( $path ) ) {
			WP_CLI::error( "Asset not found: {$path}" );
		}
		$tmp = wp_tempnam( basename( $relative ) );
		copy( $path, $tmp );
		$id = media_handle_sideload( array( 'name' => basename( $relative ), 'tmp_name' => $tmp ), 0 );
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( "{$relative}: " . $id->get_error_message() );
		}
		update_post_meta( $id, '_clone_source', $relative );
		WP_CLI::log( "Imported {$relative} → attachment {$id}" );
	}
	if ( null !== $alt ) {
		update_post_meta( $id, '_wp_attachment_image_alt', $alt );
	}
	return $cache[ $relative ] = (int) $id;
}

function clone_resolve( $value, $ctx ) {
	if ( is_string( $value ) ) {
		$value = preg_replace_callback( '/\{\{file:([^}]+)\}\}/', function ( $m ) use ( $ctx ) {
			$path = $ctx['dir'] . '/' . trim( $m[1] );
			if ( ! is_readable( $path ) ) {
				WP_CLI::error( "File not found: {$path}" );
			}
			return (string) file_get_contents( $path );
		}, $value );
		$value = preg_replace_callback( '/\{\{menu:([^}]+)\}\}/', function ( $m ) use ( $ctx ) {
			$key = trim( $m[1] );
			if ( ! isset( $ctx['menus'][ $key ] ) ) {
				WP_CLI::error( "Unknown menu placeholder {{menu:{$key}}}." );
			}
			return (string) $ctx['menus'][ $key ];
		}, $value );
		return preg_replace_callback( '/\{\{asset:([^}]+)\}\}/', function ( $m ) use ( $ctx ) {
			return (string) wp_get_attachment_url( clone_import_media( trim( $m[1] ), null, $ctx['assets'] ) );
		}, $value );
	}
	if ( ! is_array( $value ) ) {
		return $value;
	}
	if ( isset( $value['asset'] ) && is_string( $value['asset'] ) ) {
		$id = clone_import_media( $value['asset'], $value['alt'] ?? null, $ctx['assets'] );
		return array( 'id' => $id, 'url' => (string) wp_get_attachment_url( $id ), 'alt' => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ), 'source' => 'library' );
	}
	foreach ( $value as $key => $item ) {
		$value[ $key ] = clone_resolve( $item, $ctx );
	}
	return $value;
}

function clone_prepare_elements( array $elements, $seed, array &$seen, array $widgets ) {
	foreach ( $elements as $index => &$element ) {
		$path = "{$seed}/{$index}";
		if ( empty( $element['id'] ) ) {
			$element['id'] = substr( md5( $path ), 0, 7 );
		}
		if ( isset( $seen[ $element['id'] ] ) ) {
			WP_CLI::error( "Duplicate element id {$element['id']} ({$path})." );
		}
		$seen[ $element['id'] ] = true;
		if ( empty( $element['elType'] ) ) {
			WP_CLI::error( "Element {$element['id']} has no elType." );
		}
		if ( 'widget' === $element['elType'] && ! in_array( $element['widgetType'] ?? '', $widgets, true ) ) {
			WP_CLI::warning( "Widget '{$element['widgetType']}' ({$element['id']}) is not available here (unknown, or a locked Pro widget)." );
		}
		$element['settings'] = (object) ( $element['settings'] ?? array() );
		$element['elements'] = clone_prepare_elements( $element['elements'] ?? array(), $path, $seen, $widgets );
		$element['isInner']  = (bool) ( $element['isInner'] ?? ( 'container' === $element['elType'] && substr_count( $path, '/' ) > 1 ) );
	}
	return $elements;
}

function clone_sync_menu( $key, array $menu ) {
	$name    = $menu['name'] ?? $key;
	$term    = wp_get_nav_menu_object( $name );
	$menu_id = $term ? (int) $term->term_id : 0;
	if ( $menu_id && get_term_meta( $menu_id, '_clone_source', true ) !== $key ) {
		WP_CLI::error( "A menu named '{$name}' already exists and was not created by the clone. Rename the clone menu." );
	}
	// Rebuild only when the items changed: every menu item save can trigger a full page-cache purge
	// (LiteSpeed, WP Rocket), which hurts a live site.
	$hash = md5( wp_json_encode( $menu['items'] ?? array() ) );
	if ( $menu_id && get_term_meta( $menu_id, '_clone_hash', true ) === $hash ) {
		WP_CLI::log( "Menu '{$name}' ({$menu_id}) unchanged." );
		return $menu_id;
	}
	if ( ! $menu_id ) {
		$menu_id = wp_create_nav_menu( $name );
		if ( is_wp_error( $menu_id ) ) {
			WP_CLI::error( $menu_id->get_error_message() );
		}
		update_term_meta( $menu_id, '_clone_source', $key );
	}
	foreach ( (array) wp_get_nav_menu_items( $menu_id, array( 'post_status' => 'any' ) ) as $item ) {
		wp_delete_post( $item->ID, true );
	}
	$add = function ( array $items, $parent_id ) use ( &$add, $menu_id ) {
		foreach ( $items as $position => $item ) {
			$id = wp_update_nav_menu_item( $menu_id, 0, array(
				'menu-item-title'     => $item['label'],
				'menu-item-url'       => $item['url'],
				'menu-item-type'      => 'custom',
				'menu-item-status'    => 'publish',
				'menu-item-target'    => $item['target'] ?? '',
				'menu-item-parent-id' => $parent_id,
				'menu-item-position'  => $position + 1,
			) );
			if ( is_wp_error( $id ) ) {
				WP_CLI::error( $id->get_error_message() );
			}
			$add( $item['children'] ?? array(), $id );
		}
	};
	$add( $menu['items'] ?? array(), 0 );
	update_term_meta( $menu_id, '_clone_hash', $hash );
	WP_CLI::log( "Menu '{$name}' ({$menu_id}) synced." );
	return $menu_id;
}

function clone_upsert_list( array $current, array $incoming ) {
	$by_id = array();
	foreach ( $current as $item ) {
		$by_id[ $item['_id'] ?? md5( wp_json_encode( $item ) ) ] = $item;
	}
	foreach ( $incoming as $item ) {
		$by_id[ $item['_id'] ] = $item;
	}
	return array_values( $by_id );
}

$clone_global_change = false;
$clone_saved_pages   = array();
foreach ( $args as $clone_file ) {
	$clone_file = str_replace( '\\', '/', $clone_file );
	$clone_data = json_decode( (string) file_get_contents( $clone_file ), true );
	if ( ! is_array( $clone_data ) ) {
		WP_CLI::error( "{$clone_file}: invalid JSON (" . json_last_error_msg() . ')' );
	}
	$clone_menus = array();
	foreach ( $clone_data['menus'] ?? array() as $menu_key => $menu ) {
		$clone_menus[ $menu_key ] = clone_sync_menu( $menu_key, $menu );
	}
	unset( $clone_data['menus'] );
	$clone_data = clone_resolve( $clone_data, array( 'dir' => dirname( $clone_file ), 'assets' => $clone_assets_dir, 'menus' => $clone_menus ) );

	foreach ( $clone_data['options'] ?? array() as $option => $value ) {
		if ( 0 !== strpos( $option, 'elementor_' ) ) {
			WP_CLI::error( "Refusing to set non-Elementor option {$option}." );
		}
		update_option( $option, $value );
		$clone_global_change = true;
		WP_CLI::log( "Option {$option} updated." );
	}

	if ( ! empty( $clone_data['kit'] ) ) {
		$kit      = $clone_plugin->kits_manager->get_active_kit();
		$settings = $kit->get_meta( '_elementor_page_settings' );
		$settings = is_array( $settings ) ? $settings : array();
		foreach ( $clone_data['kit'] as $key => $value ) {
			$settings[ $key ] = in_array( $key, array( 'custom_colors', 'custom_typography' ), true )
				? clone_upsert_list( $settings[ $key ] ?? array(), $value )
				: $value;
		}
		if ( ! $kit->save( array( 'settings' => $settings ) ) ) {
			WP_CLI::error( 'Saving the kit failed.' );
		}
		$clone_global_change = true;
		WP_CLI::log( 'Kit ' . $kit->get_id() . ' updated.' );
	}

	if ( ! empty( $clone_data['page'] ) ) {
		$page_meta = $clone_data['page'];
		$post      = get_page_by_path( $page_meta['path'], OBJECT, 'page' );
		$segments  = explode( '/', trim( $page_meta['path'], '/' ) );
		$slug      = array_pop( $segments );
		$parent    = $segments ? get_page_by_path( implode( '/', $segments ), OBJECT, 'page' ) : null;
		if ( $segments && ! $parent ) {
			WP_CLI::error( "Parent page '" . implode( '/', $segments ) . "' does not exist; create it first." );
		}
		$postarr = array(
			'post_type'   => 'page',
			'post_title'  => $page_meta['title'] ?? $slug,
			'post_name'   => $slug,
			'post_parent' => $parent ? $parent->ID : 0,
		);
		if ( $post ) {
			$postarr['ID'] = $post->ID;
			if ( isset( $page_meta['status'] ) ) {
				$postarr['post_status'] = $page_meta['status'];
			}
			$post_id = wp_update_post( $postarr, true );
		} else {
			$postarr['post_status'] = $page_meta['status'] ?? 'draft';
			$post_id                = wp_insert_post( $postarr, true );
		}
		if ( is_wp_error( $post_id ) ) {
			WP_CLI::error( $post_id->get_error_message() );
		}
		update_post_meta( $post_id, '_wp_page_template', $page_meta['template'] ?? 'elementor_canvas' );

		$seen     = array();
		$elements = clone_prepare_elements( $clone_data['elements'] ?? array(), basename( $clone_file ), $seen, $clone_widgets );
		$document = $clone_plugin->documents->get( $post_id, false );
		// save() stores the data but (in 4.x) does not flag the post as built with Elementor
		// (_elementor_edit_mode = builder); without it the front end renders the plain post_content.
		$document->set_is_built_with_elementor( true );
		$saved = $document->save( array( 'elements' => json_decode( wp_json_encode( $elements ), true ), 'settings' => $clone_data['settings'] ?? array() ) );
		if ( ! $saved ) {
			WP_CLI::error( "Elementor refused to save page {$post_id}." );
		}
		$clone_saved_pages[] = $post_id;
		WP_CLI::success( sprintf( '%s → page %d, %s (edit: %s)', $clone_file, $post_id, get_permalink( $post_id ), $document->get_edit_url() ) );
	}
}

// Kit or option changes restyle every page, so all generated CSS must go. Otherwise regenerate only the
// imported pages' CSS: clearing the whole cache also makes caching plugins purge the entire site.
if ( $clone_global_change ) {
	$clone_plugin->files_manager->clear_cache();
	WP_CLI::success( 'Kit/options changed: all Elementor CSS cleared.' );
} else {
	foreach ( $clone_saved_pages as $clone_page_id ) {
		\Elementor\Core\Files\CSS\Post::create( $clone_page_id )->delete();
	}
	WP_CLI::success( 'CSS of the imported pages will regenerate on their next view.' );
}
