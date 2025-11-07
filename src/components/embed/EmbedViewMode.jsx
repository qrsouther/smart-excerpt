/**
 * EmbedViewMode Component
 *
 * Renders the Embed in view mode (read-only) with cached content.
 * Displays Update Available banner if Source has changed since last sync.
 *
 * Features:
 * - Renders cached ADF or plain text content
 * - Shows UpdateAvailableBanner when stale
 * - Cleans ADF for proper rendering
 * - Handles loading states
 *
 * @param {Object} props
 * @param {Object|string} props.content - Cached content to display (ADF or text)
 * @param {boolean} props.isStale - Whether Source content has changed
 * @param {boolean} props.showDiffView - Whether diff view is visible
 * @param {Function} props.setShowDiffView - Toggle diff view
 * @param {Function} props.handleUpdateToLatest - Update to latest content
 * @param {boolean} props.isUpdating - Whether update is in progress
 * @param {Object} props.syncedContent - Previously synced Source content
 * @param {Object} props.latestRenderedContent - Latest Source content
 * @param {Object} props.variableValues - Current variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @returns {JSX.Element} - View mode JSX
 */

import React, { Fragment } from 'react';
import {
  Text,
  Box,
  AdfRenderer
} from '@forge/react';
import { cleanAdfForRenderer } from '../../utils/adf-rendering-utils';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { adfContentContainerStyle } from '../../styles/embed-styles';

export function EmbedViewMode({
  content,
  isStale,
  showDiffView,
  setShowDiffView,
  handleUpdateToLatest,
  isUpdating,
  syncedContent,
  latestRenderedContent,
  variableValues,
  toggleStates
}) {
  // Loading state
  if (!content) {
    return <Text>Loading content...</Text>;
  }

  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  // ADF content
  if (isAdf) {
    const cleaned = cleanAdfForRenderer(content);

    if (!cleaned) {
      return <Text>Error: Content cleaning failed</Text>;
    }

    return (
      <Fragment>
        <UpdateAvailableBanner
          isStale={isStale}
          showDiffView={showDiffView}
          setShowDiffView={setShowDiffView}
          handleUpdateToLatest={handleUpdateToLatest}
          isUpdating={isUpdating}
          syncedContent={syncedContent}
          latestRenderedContent={latestRenderedContent}
          variableValues={variableValues}
          toggleStates={toggleStates}
        />
        <Box xcss={adfContentContainerStyle}>
          <AdfRenderer document={cleaned} />
        </Box>
      </Fragment>
    );
  }

  // Plain text content
  return (
    <Fragment>
      <UpdateAvailableBanner
        isStale={isStale}
        showDiffView={showDiffView}
        setShowDiffView={setShowDiffView}
        handleUpdateToLatest={handleUpdateToLatest}
        isUpdating={isUpdating}
        syncedContent={syncedContent}
        latestRenderedContent={latestRenderedContent}
        variableValues={variableValues}
        toggleStates={toggleStates}
      />
      <Box xcss={adfContentContainerStyle}>
        {content && typeof content === 'object' && content.type === 'doc' ? (
          <AdfRenderer document={content} />
        ) : (
          <Text>{content}</Text>
        )}
      </Box>
    </Fragment>
  );
}
