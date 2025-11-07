/**
 * OrphanedItemsSection Component
 *
 * Displays orphaned Sources and Embeds that need attention:
 * - Orphaned Sources: Source macros deleted from their pages
 * - Orphaned Embeds: Embed macros referencing deleted Sources
 *
 * Shows cards with details and "View Details" buttons to open modal.
 *
 * @param {Object} props
 * @param {Array} props.orphanedSources - Array of orphaned source objects
 * @param {Array} props.orphanedUsage - Array of orphaned embed references
 * @param {Function} props.onSelectOrphanedItem - Callback when "View Details" clicked
 * @param {Object} props.cardStyles - xcss styles for card containers
 * @returns {JSX.Element|null}
 */

import React, { Fragment } from 'react';
import {
  Text,
  Strong,
  Em,
  Box,
  Inline,
  Button,
  Lozenge,
  Badge
} from '@forge/react';

export function OrphanedItemsSection({
  orphanedSources,
  orphanedUsage,
  onSelectOrphanedItem,
  cardStyles
}) {
  // Don't render if no orphaned items
  if (orphanedSources.length === 0 && orphanedUsage.length === 0) {
    return null;
  }

  return (
    <Box>
      <Fragment>
        {/* Orphaned Sources Section */}
        {orphanedSources.length > 0 && (
          <Fragment>
            <Text>{' '}</Text>
            <Text>{' '}</Text>
            <Text><Strong>⚠ Orphaned Sources</Strong></Text>
            <Text>These Sources haven't checked in recently (likely deleted from page):</Text>
            <Text>{' '}</Text>
            <Inline space="space.200" shouldWrap>
              {orphanedSources.map((orphaned) => (
                <Box key={orphaned.id} xcss={cardStyles}>
                  <Lozenge appearance="removed" isBold>ORPHANED SOURCE</Lozenge>
                  <Text>{' '}</Text>
                  <Text><Strong>{orphaned.name || 'Unknown'}</Strong></Text>
                  <Text>{' '}</Text>
                  <Text><Em>{orphaned.orphanedReason || 'Unknown reason'}</Em></Text>
                  <Text>{' '}</Text>
                  <Lozenge>{orphaned.category || 'General'}</Lozenge>
                  <Button
                    appearance="warning"
                    onClick={() => onSelectOrphanedItem(orphaned)}
                  >
                    View Details
                  </Button>
                </Box>
              ))}
            </Inline>
          </Fragment>
        )}

        {/* Orphaned Usage Section */}
        {orphanedUsage.length > 0 && (
          <Fragment>
            <Text>{' '}</Text>
            <Text>{' '}</Text>
            <Text><Strong>⚠ Orphaned Embeds</Strong></Text>
            <Text>These Embed macros reference Sources that no longer exist:</Text>
            <Text>{' '}</Text>
            <Inline space="space.200" shouldWrap>
              {orphanedUsage.map((orphaned) => (
                <Box key={orphaned.excerptId} xcss={cardStyles}>
                  <Lozenge appearance="removed" isBold>ORPHANED</Lozenge>
                  <Text>{' '}</Text>
                  <Text><Strong>{orphaned.excerptName}</Strong></Text>
                  <Text>{' '}</Text>
                  <Inline space="space.100" alignBlock="center">
                    <Badge>{orphaned.referenceCount}</Badge>
                    <Text>page(s) affected</Text>
                  </Inline>
                  <Button
                    appearance="warning"
                    onClick={() => onSelectOrphanedItem(orphaned)}
                  >
                    View Details
                  </Button>
                </Box>
              ))}
            </Inline>
          </Fragment>
        )}
      </Fragment>
    </Box>
  );
}
