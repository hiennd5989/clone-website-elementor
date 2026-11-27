<?php
/**
 * Render a page (draft, private or published) to stdout as a logged-in visitor would get it, without the admin bar,
 * so it can be saved as HTML and screenshotted next to the source. Drafts need no login cookie this way.
 *
 *   wp eval-file render-page.php <page-id> --user=<admin> > page.html
 *
 * Open page.html in the browser (file://). Asset URLs are absolute, so CSS, fonts and images load from the site.
 * Lazy-loaded images may need a scroll before the screenshot.
 */

if ( ! defined( 'WP_CLI' ) ) {
	exit;
}

$clone_id = isset( $args[0] ) ? (int) preg_replace( '/\D/', '', $args[0] ) : 0;
if ( ! $clone_id || ! get_post( $clone_id ) ) {
	WP_CLI::error( 'Usage: wp eval-file render-page.php <page-id> --user=<admin>' );
}

add_filter( 'show_admin_bar', '__return_false' );

// Opened from disk (file://), protocol-relative URLs (//host/…) would point at file://host and the site's
// http:// URLs may be blocked or redirected: make every URL of this site absolute https.
$clone_host = wp_parse_url( home_url(), PHP_URL_HOST );
ob_start(
	function ( $html ) use ( $clone_host ) {
		$quoted = preg_quote( $clone_host, '#' );
		$html   = preg_replace( '#(["\'(\s])//' . $quoted . '#', '$1https://' . $clone_host, $html );
		return preg_replace( '#http://' . $quoted . '#', 'https://' . $clone_host, $html );
	}
);
$GLOBALS['wp']->main( array( 'page_id' => $clone_id, 'preview' => 'true' ) );
$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];

$clone_template = get_page_template();
$clone_template = apply_filters( 'template_include', $clone_template ? $clone_template : get_index_template() );
include $clone_template;
ob_end_flush();
