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
 *
 * @param {Object} props
 * @param {Array} props.documentationLinks - Array of {anchor, url} objects
 * @returns {JSX.Element|null} - Display JSX or null if no links
 */

import React from 'react';
import {
  Box,
  Inline,
  Icon,
  Button
} from '@forge/react';
import { router } from '@forge/bridge';

export function DocumentationLinksDisplay({ documentationLinks }) {
  // Don't render if no documentation links
  if (!documentationLinks || documentationLinks.length === 0) {
    return null;
  }

  return (
    <Box
      padding="space.200"
      backgroundColor="color.background.neutral"
      xcss={{
        borderRadius: 'border.radius.200',
        width: '100%'
      }}
    >
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
    </Box>
  );
}
