<?php
/**
 * Print the site inventory, or the settings keys of Elementor elements, for the installed version.
 *
 *   wp eval-file elementor-controls.php                          # inventory
 *   wp eval-file elementor-controls.php heading image            # controls of widgets
 *   wp eval-file elementor-controls.php container kit page       # a container, the active kit, a page
 *   wp eval-file elementor-controls.php out=controls.json heading # write to a file instead of stdout
 *
 * Output is one JSON object. Each control lists its type, default (which shows the value shape
 * to write), options, size units, and CSS selectors. Responsive variants are separate keys
 * (…_tablet, …_mobile, plus any enabled extra breakpoints).
 */

if ( ! defined( 'WP_CLI' ) || ! did_action( 'elementor/loaded' ) ) {
	WP_CLI::error( 'Run with WP-CLI on a site where Elementor is active.' );
}

$clone_plugin = \Elementor\Plugin::$instance;

// Outside the editor, Elementor (3.2x+/4.x) keeps Style-tab controls in a separate stack and
// get_controls() omits them unless this flag is on.
if ( class_exists( '\Elementor\Core\Frontend\Performance' ) ) {
	\Elementor\Core\Frontend\Performance::set_use_style_controls( true );
}
// Outside the editor, responsive controls are one key (no …_tablet/…_mobile variants) unless
// duplication is on, as it is in the editor and during CSS generation.
if ( method_exists( $clone_plugin->breakpoints, 'set_responsive_control_duplication_mode' ) ) {
	$clone_plugin->breakpoints->set_responsive_control_duplication_mode( 'on' );
}

$clone_out_file = null;
$clone_names    = array();
foreach ( $args as $clone_arg ) {
	if ( 0 === strpos( $clone_arg, 'out=' ) ) {
		$clone_out_file = substr( $clone_arg, 4 );
	} else {
		$clone_names[] = $clone_arg;
	}
}

$clone_result = array();

if ( ! $clone_names ) {
	$theme       = wp_get_theme();
	$experiments = array();
	foreach ( $clone_plugin->experiments->get_features() as $name => $feature ) {
		$experiments[ $name ] = $clone_plugin->experiments->is_feature_active( $name ) ? 'active' : 'inactive';
	}
	$kit          = $clone_plugin->kits_manager->get_active_kit();
	$clone_result = array(
		'wordpress'      => get_bloginfo( 'version' ),
		'php'            => PHP_VERSION,
		'theme'          => $theme->get( 'Name' ) . ' ' . $theme->get( 'Version' ) . ( $theme->parent() ? ' (child of ' . $theme->parent()->get( 'Name' ) . ')' : '' ),
		'elementor'      => ELEMENTOR_VERSION,
		'elementor_pro'  => defined( 'ELEMENTOR_PRO_VERSION' ) ? ELEMENTOR_PRO_VERSION : null,
		'woocommerce'    => defined( 'WC_VERSION' ) ? WC_VERSION : null,
		'active_plugins' => get_option( 'active_plugins' ),
		'page_templates' => array_merge( array( 'default' => 'Default' ), array_flip( get_page_templates( null, 'page' ) ) ),
		'breakpoints'    => array_map(
			fn( $bp ) => array( 'value' => $bp->get_value(), 'direction' => $bp->get_direction(), 'enabled' => $bp->is_enabled() ),
			$clone_plugin->breakpoints->get_breakpoints()
		),
		'kit_id'         => $kit ? $kit->get_id() : null,
		'experiments'    => $experiments,
		'options'        => array(
			'elementor_disable_color_schemes'      => get_option( 'elementor_disable_color_schemes' ),
			'elementor_disable_typography_schemes' => get_option( 'elementor_disable_typography_schemes' ),
			'elementor_google_font'                => get_option( 'elementor_google_font' ),
			'elementor_css_print_method'           => get_option( 'elementor_css_print_method' ),
		),
		// Free registers Pro widgets as locked promotions; atomic (V4) widgets are a separate system.
		'widgets'        => array( 'classic' => array(), 'atomic_v4' => array(), 'pro_locked' => array() ),
		'element_types'  => array_keys( $clone_plugin->elements_manager->get_element_types() ),
	);
	foreach ( $clone_plugin->widgets_manager->get_widget_types() as $name => $widget ) {
		if ( is_a( $widget, 'Elementor\Modules\Promotions\Widgets\Pro_Widget_Promotion' ) ) {
			$clone_result['widgets']['pro_locked'][] = $name;
		} elseif ( is_a( $widget, 'Elementor\Modules\AtomicWidgets\Elements\Base\Atomic_Widget_Base' ) ) {
			$clone_result['widgets']['atomic_v4'][] = $name;
		} else {
			$clone_result['widgets']['classic'][] = $name;
		}
	}
}

// Editor-only control types that hold no setting.
$clone_skip = array( 'section', 'tab', 'tabs', 'heading', 'divider', 'raw_html', 'deprecated_notice', 'alert', 'notice', 'button' );

foreach ( $clone_names as $clone_name ) {
	switch ( $clone_name ) {
		case 'kit':
			$element = $clone_plugin->kits_manager->get_active_kit();
			break;
		case 'page':
			// Page settings need a real page; any existing one will do.
			$page_ids = get_posts( array( 'post_type' => 'page', 'post_status' => 'any', 'numberposts' => 1, 'fields' => 'ids' ) );
			$element  = $page_ids ? $clone_plugin->documents->get( $page_ids[0], false ) : null;
			if ( ! $element ) {
				WP_CLI::warning( 'No page exists yet to read page settings from; create one first.' );
				continue 2;
			}
			break;
		default:
			$element = $clone_plugin->elements_manager->get_element_types( $clone_name );
			$element = $element ? $element : $clone_plugin->widgets_manager->get_widget_types( $clone_name );
	}
	if ( ! $element ) {
		WP_CLI::warning( "Unknown element: {$clone_name}" );
		continue;
	}
	$controls = array();
	foreach ( $element->get_controls() as $key => $control ) {
		if ( in_array( $control['type'] ?? '', $clone_skip, true ) ) {
			continue;
		}
		$controls[ $key ] = array_filter(
			array(
				'type'       => $control['type'] ?? null,
				'default'    => $control['default'] ?? null,
				'options'    => isset( $control['options'] ) && is_array( $control['options'] ) ? array_keys( $control['options'] ) : null,
				'size_units' => $control['size_units'] ?? null,
				'selectors'  => isset( $control['selectors'] ) ? $control['selectors'] : null,
				// Per-unit CSS, e.g. a grid's "custom" unit takes a whole track list ("1fr 2fr", "repeat(5, 1fr)").
				'unit_selectors' => $control['unit_selectors_dictionary'] ?? null,
			),
			fn( $v ) => null !== $v && '' !== $v && array() !== $v
		);
	}
	$clone_result[ $clone_name ] = $controls;
}

$clone_json = wp_json_encode( $clone_result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "\n";
if ( $clone_out_file ) {
	file_put_contents( $clone_out_file, $clone_json );
	WP_CLI::success( "Wrote {$clone_out_file}" );
} else {
	echo $clone_json; // phpcs:ignore WordPress.Security.EscapeOutput
}
