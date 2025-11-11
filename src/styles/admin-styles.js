/**
 * Admin Page Styles
 *
 * Centralized xcss style definitions for the Blueprint Standards Admin page.
 * All styles use Forge's xcss() system for type-safe, theme-aware styling.
 *
 * Style Categories:
 * - Card Styles: Shared card container styling for excerpt cards, orphaned items, etc.
 * - Table Styles: Full-width table container styling
 * - Preview Styles: Content preview box styling (matches Embed macro preview)
 * - Form Controls: Select dropdown sizing
 * - Layout Styles: Sidebar and content area sizing/spacing
 *
 * @see https://developer.atlassian.com/platform/forge/ui-kit/xcss/
 */

import { xcss } from '@forge/react';

/**
 * Card container styling
 * Used for: excerpt cards, orphaned items, category cards, etc.
 */
export const cardStyles = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  boxShadow: 'elevation.shadow.raised',
  backgroundColor: 'color.background.neutral.subtle',
  minWidth: '250px',
  flex: '1 1 250px'
});

/**
 * Full-width table container
 * Used for: includes table, usage tables, etc.
 */
export const fullWidthTableStyle = xcss({
  width: '100%'
});

/**
 * Scrollable table container
 * Used for: usage details table that may have many variable/toggle columns
 * Adds horizontal scrollbar when table content overflows
 */
export const tableScrollContainerStyle = xcss({
  width: '100%',
  maxWidth: '100%',
  overflowX: 'auto'
});

/**
 * Preview content box styling
 * Matches the Include macro preview styling for consistency
 */
export const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

/**
 * Select dropdown sizing
 * Compact width to fit within sidebar
 */
export const selectStyles = xcss({
  width: '100%',
  maxWidth: '180px'
});

/**
 * Left sidebar layout
 * Takes up 15% of viewport width for category navigation and filters
 */
export const leftSidebarStyles = xcss({
  width: '15%',
  minWidth: '200px',
  paddingInlineEnd: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

/**
 * Middle section layout
 * Takes up 85% of viewport width when right panel is hidden
 */
export const middleSectionStyles = xcss({
  width: '85%',
  paddingInlineEnd: 'space.200',
  paddingInlineStart: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

/**
 * Right content area layout
 * Takes up 45% of viewport width for preview/details panel
 */
export const rightContentStyles = xcss({
  width: '45%',
  paddingInlineStart: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

/**
 * Section separator styling
 * Used for visual separation between major page sections
 */
export const sectionSeparatorStyles = xcss({
  marginBlockEnd: 'space.300',
  paddingBlockEnd: 'space.200',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width'
});

/**
 * Standard section margin
 * Used for consistent spacing between sections
 */
export const sectionMarginStyles = xcss({
  marginBlockEnd: 'space.300'
});
