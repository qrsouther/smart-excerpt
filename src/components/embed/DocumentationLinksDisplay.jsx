/**
 * DocumentationLinksDisplay Component
 *
 * Displays documentation links from the Blueprint Standard Source in a styled box.
 * Links appear as Default buttons that open in a new tab.
 *
 * Features:
 * - Full-width light gray background box
 * - Document icon on the left with medium padding
 * - Links displayed inline as default buttons
 * - Opens links in new tab
 * - Subtly rounded borders
 * - Optional "Checking for Source updates..." message on the right when checking staleness
 *
 * @param {Object} props
 * @param {Array} props.documentationLinks - Array of {anchor, url} objects
 * @param {boolean} props.isCheckingStaleness - Whether to show checking message on the right
 * @returns {JSX.Element|null} - Display JSX or null if no links
 */

import React from 'react';
import {
  Box,
  Inline,
  Icon,
  Button,
  Text,
  xcss
} from '@forge/react';
import { router } from '@forge/bridge';

const checkingTextStyle = xcss({
  color: 'background.accent.gray.subtler', // Light gray design token
  fontStyle: 'italic',
  fontSize: '10px' // Smaller than default small size
});

const spinnerStyle = xcss({
  marginLeft: 'space.050',
  marginInlineEnd: 'space.050'
});

export function DocumentationLinksDisplay({ documentationLinks, isCheckingStaleness }) {
  // Don't render if no documentation links and not checking staleness
  if ((!documentationLinks || documentationLinks.length === 0) && !isCheckingStaleness) {
    return null;
  }

  return (
    <Box
      padding="space.100"
      backgroundColor="color.background.neutral"
      xcss={{
        borderRadius: 'border.radius.200',
        width: '100%'
      }}
    >
      <Inline space="space.200" alignBlock="center" spread="space-between">
        {(documentationLinks && documentationLinks.length > 0) ? (
          <Inline space="space.200" alignBlock="center">
            <Icon glyph="page" size="medium" label="Documentation" />
            {documentationLinks.map((link, index) => (
              <Button
                key={index}
                appearance="default"
                onClick={async () => {
                  try {
                    await router.open(link.url);
                  } catch (err) {
                    console.error('[DOCUMENTATION-LINK] Navigation error:', err);
                  }
                }}
              >
                {link.anchor}
              </Button>
            ))}
          </Inline>
        ) : (
          <Box></Box>
        )}
        {isCheckingStaleness && (
          <Inline space="space.050" alignBlock="center">
            <Text weight="extra-light" size="small" xcss={checkingTextStyle}>Checking for Source updates...</Text>
            <Text weight="extra-light" size="small" xcss={spinnerStyle}>⟳</Text>
          </Inline>
        )}
      </Inline>
    </Box>
  );
}
