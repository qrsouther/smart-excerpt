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
 * - Optional redline status badge on the right after staleness check completes
 *
 * @param {Object} props
 * @param {Array} props.documentationLinks - Array of {anchor, url} objects
 * @param {boolean} props.isCheckingStaleness - Whether to show checking message on the right
 * @param {string} props.redlineStatus - Current redline status
 * @param {string} props.approvedBy - User who approved (if approved)
 * @param {string} props.approvedAt - Timestamp of approval (if approved)
 * @returns {JSX.Element|null} - Display JSX or null if no links
 */

import React from 'react';
import {
  Box,
  Code,
  Inline,
  Icon,
  Button,
  Text,
  Lozenge,
  Tooltip,
  xcss
} from '@forge/react';
import { router } from '@forge/bridge';
import { useConfluenceUserQuery } from '../../hooks/redline-hooks';

const checkingTextStyle = xcss({
  color: 'background.accent.gray.subtler', // Light gray design token
  fontStyle: 'italic',
  fontSize: '10px' // Smaller than default small size
});

const spinnerStyle = xcss({
  marginLeft: 'space.050',
  marginInlineEnd: 'space.050'
});

export function DocumentationLinksDisplay({
  documentationLinks,
  isCheckingStaleness,
  redlineStatus,
  approvedBy,
  approvedAt,
  lastChangedBy
}) {
  // Fetch user data based on status:
  // - needs-revision and pre-approved: use lastChangedBy
  // - approved: use approvedBy
  const userIdToFetch =
    (redlineStatus === 'needs-revision' || redlineStatus === 'pre-approved') && lastChangedBy
      ? lastChangedBy
      : redlineStatus === 'approved' && approvedBy
        ? approvedBy
        : null;

  const { data: statusUser } = useConfluenceUserQuery(userIdToFetch);

  // Don't render if no documentation links, not checking staleness, and no redline status
  if ((!documentationLinks || documentationLinks.length === 0) && !isCheckingStaleness && !redlineStatus) {
    return null;
  }

  // Render status badge helper
  const renderRedlineStatus = () => {
    if (!redlineStatus || isCheckingStaleness) return null;

    const appearances = {
      'reviewable': 'new',
      'pre-approved': 'inprogress',
      'needs-revision': 'removed',
      'approved': 'success'
    };

    const labels = {
      'reviewable': 'Reviewable',
      'pre-approved': 'Pre-Approved',
      'needs-revision': 'Needs Revision',
      'approved': 'Approved'
    };

    // Build dynamic tooltips with user mentions and fallbacks
    const needsRevisionTooltip = statusUser?.displayName
      ? `Updates are needed; discuss with ${statusUser.displayName}.`
      : 'Updates are needed; discuss with the Architecture team.';

    const preApprovedTooltip = statusUser?.displayName
      ? `Initial review completed by ${statusUser.displayName}; content is sufficient but its accuracy needs further validation.`
      : 'Initial Architecture review done; content is sufficient but its accuracy needs further validation.';

    const approvedTooltip = statusUser?.displayName
      ? `Review completed by ${statusUser.displayName} on ${new Date(approvedAt).toLocaleDateString()}. Content is reliable and up-to-date.`
      : 'Architecture review done. Content is reliable and up-to-date.';

    const tooltips = {
      'reviewable': 'Chapter is in queue awaiting Architecture approval.',
      'pre-approved': preApprovedTooltip,
      'needs-revision': needsRevisionTooltip,
      'approved': approvedTooltip
    };

    return (
      <Inline space="space.100" alignBlock="center">
        <Tooltip content={tooltips[redlineStatus] || ''}>
          <Lozenge appearance={appearances[redlineStatus] || 'default'}>
            {labels[redlineStatus] || redlineStatus}
          </Lozenge>
          {redlineStatus === 'approved' && approvedAt && (
            <>
              {' '}
              <Code>on {new Date(approvedAt).toLocaleDateString()}</Code>
            </>
          )}
        </Tooltip>
      </Inline>
    );
  };

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
        {isCheckingStaleness ? (
          <Inline space="space.050" alignBlock="center">
            <Text size="small" color="color.text.disabled">Checking for Source updates... ⟳</Text>
          </Inline>
        ) : (
          renderRedlineStatus()
        )}
      </Inline>
    </Box>
  );
}
