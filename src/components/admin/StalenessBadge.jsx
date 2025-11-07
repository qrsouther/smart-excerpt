/**
 * StalenessBadge Component
 *
 * Displays a status badge indicating whether an Embed instance is up to date
 * with its Source. Shows a tooltip with Source and Embed sync timestamps.
 *
 * @param {Object} props
 * @param {boolean} props.isStale - Whether the Embed is out of sync with the Source
 * @param {Date} props.sourceLastModified - When the Source was last updated
 * @param {Date} props.embedLastSynced - When the Embed last synced with Source
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Lozenge,
  Tooltip
} from '@forge/react';

/**
 * Format a Date object as a localized timestamp string with timezone
 * @param {Date} date - Date to format
 * @returns {string} Formatted timestamp (e.g., "01/15/2025 14:30 PST")
 */
function formatTimestamp(date) {
  if (!date || date.getTime() === 0) return 'Never';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  // Get timezone abbreviation
  const timezoneName = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

  return `${month}/${day}/${year} ${hours}:${minutes} ${timezoneName}`;
}

export function StalenessBadge({
  isStale,
  sourceLastModified,
  embedLastSynced
}) {
  const tooltipText = `Source last updated: ${formatTimestamp(sourceLastModified)}\nEmbed last synced: ${formatTimestamp(embedLastSynced)}`;

  return (
    <Tooltip content={tooltipText}>
      {isStale ? (
        <Lozenge appearance="moved">Update Available</Lozenge>
      ) : (
        <Lozenge appearance="success">Up to date</Lozenge>
      )}
    </Tooltip>
  );
}
