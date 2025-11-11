/**
 * EmbedViewMode Component
 *
 * Renders the Embed in view mode (read-only) with cached content.
 * Shows subtle indicator while checking for updates, then progressive disclosure
 * of update banner when user clicks "Review Update" button.
 *
 * Features:
 * - Renders cached ADF or plain text content
 * - Shows subtle "Checking..." indicator during staleness check
 * - Shows green "Review Update" button when stale content detected
 * - Progressive disclosure: banner only appears when user clicks Review button
 * - Cleans ADF for proper rendering
 * - Handles loading states
 *
 * @param {Object} props
 * @param {Object|string} props.content - Cached content to display (ADF or text)
 * @param {boolean} props.isStale - Whether Source content has changed
 * @param {boolean} props.isCheckingStaleness - Whether staleness check is running
 * @param {boolean} props.showDiffView - Whether diff view is visible
 * @param {Function} props.setShowDiffView - Toggle diff view
 * @param {Function} props.handleUpdateToLatest - Update to latest content
 * @param {boolean} props.isUpdating - Whether update is in progress
 * @param {Object} props.syncedContent - Previously synced Source content
 * @param {Object} props.latestRenderedContent - Latest Source content
 * @param {Object} props.variableValues - Current variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @param {Object} props.excerpt - The Source excerpt object with documentationLinks
 * @returns {JSX.Element} - View mode JSX
 */

import React, { Fragment, useState } from 'react';
import {
  Text,
  Box,
  AdfRenderer,
  Stack,
  xcss
} from '@forge/react';

// Subtle border wrapper that appears only when stale
const staleBorderWrapperStyle = xcss({
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  borderRadius: 'border.radius',
  padding: 'space.200'
});
import { cleanAdfForRenderer } from '../../utils/adf-rendering-utils';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { DocumentationLinksDisplay } from './DocumentationLinksDisplay';
import { StalenessCheckIndicator } from './StalenessCheckIndicator';
import { adfContentContainerStyle } from '../../styles/embed-styles';

export function EmbedViewMode({
  content,
  isStale,
  isCheckingStaleness,
  showDiffView,
  setShowDiffView,
  handleUpdateToLatest,
  isUpdating,
  syncedContent,
  latestRenderedContent,
  variableValues,
  toggleStates,
  excerpt
}) {
  // State for progressive disclosure - only show banner when user clicks Review button
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Handler for when user clicks "Review Update" button on indicator
  // Auto-expands diff view so user sees comparison immediately
  const handleReviewClick = () => {
    setShowUpdateBanner(true);
    setShowDiffView(true);
  };

  // Loading state
  if (!content) {
    return <Text>Loading content...</Text>;
  }

  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  // Wrapper content - either with border (when stale) or without
  const wrapperContent = (children) => {
    if (isStale || isCheckingStaleness) {
      return <Box xcss={staleBorderWrapperStyle}>{children}</Box>;
    }
    return <Fragment>{children}</Fragment>;
  };

  // ADF content
  if (isAdf) {
    const cleaned = cleanAdfForRenderer(content);

    if (!cleaned) {
      return <Text>Error: Content cleaning failed</Text>;
    }

    return wrapperContent(
      <Box xcss={xcss({ position: 'relative', width: '100%' })}>
        <StalenessCheckIndicator
          isCheckingStaleness={isCheckingStaleness}
          isStale={isStale}
          showUpdateBanner={showUpdateBanner}
          onReviewClick={handleReviewClick}
        />
        <Stack space="space.150">
          {showUpdateBanner && (
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
          )}
          <DocumentationLinksDisplay documentationLinks={excerpt?.documentationLinks} />
          <Box xcss={adfContentContainerStyle}>
            <AdfRenderer document={cleaned} />
          </Box>
        </Stack>
      </Box>
    );
  }

  // Plain text content
  return wrapperContent(
    <Box xcss={xcss({ position: 'relative', width: '100%' })}>
      <StalenessCheckIndicator
        isCheckingStaleness={isCheckingStaleness}
        isStale={isStale}
        showUpdateBanner={showUpdateBanner}
        onReviewClick={handleReviewClick}
      />
      <Stack space="space.200">
        {showUpdateBanner && (
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
        )}
        <DocumentationLinksDisplay documentationLinks={excerpt?.documentationLinks} />
        <Box xcss={adfContentContainerStyle}>
          {content && typeof content === 'object' && content.type === 'doc' ? (
            <AdfRenderer document={content} />
          ) : (
            <Text>{content}</Text>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
