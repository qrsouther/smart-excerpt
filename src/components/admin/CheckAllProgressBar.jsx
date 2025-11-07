/**
 * CheckAllProgressBar Component
 *
 * Displays progress tracking for the "Check All Embeds" operation.
 * Shows real-time progress with percentage, processed count, ETA, and final results summary.
 * Handles both dry-run (preview) mode and live cleanup mode.
 *
 * @param {Object} props
 * @param {Object|null} props.includesProgress - Progress state object with phase, percent, processed, total, results, etc.
 * @param {Function} props.onCleanUpNow - Handler for "Clean Up Now" button (switches from dry-run to live mode)
 * @param {Function} props.calculateETA - Function to calculate estimated time remaining
 * @returns {JSX.Element|null}
 */

import React, { Fragment } from 'react';
import {
  Text,
  Strong,
  Em,
  Box,
  Stack,
  Inline,
  Button,
  SectionMessage,
  ProgressBar,
  xcss
} from '@forge/react';

export function CheckAllProgressBar({
  includesProgress,
  onCleanUpNow,
  calculateETA
}) {
  if (!includesProgress) return null;

  return (
    <Box xcss={xcss({ marginBlockEnd: 'space.300' })}>
      <SectionMessage appearance={includesProgress.phase === 'complete' ? 'success' : 'information'}>
        <Stack space="space.200">
          {includesProgress.phase === 'complete' ? (
            /* COMPLETE PHASE - Show results summary */
            <Fragment>
              <Text><Strong>✅ Check Complete</Strong></Text>
              {includesProgress.results && includesProgress.results.summary && (
                <Fragment>
                  <Box xcss={xcss({ marginBlockStart: 'space.100' })}>
                    <Text><Strong>Summary:</Strong></Text>
                    <Stack space="space.050" xcss={xcss({ marginBlockStart: 'space.050' })}>
                      <Text>• {includesProgress.results.summary.activeCount} active Embed(s) - working correctly</Text>
                      <Text>• {includesProgress.results.summary.orphanedCount} orphaned Embed(s) - need cleanup</Text>
                      <Text>• {includesProgress.results.summary.brokenReferenceCount} broken reference(s) - auto-repaired</Text>
                      <Text>• {includesProgress.results.summary.staleCount} stale Embed(s) - updates available</Text>
                    </Stack>
                  </Box>

                  {/* Dry-run mode: Show "Clean Up Now" button if orphans found */}
                  {includesProgress.dryRun && includesProgress.results.summary.orphanedCount > 0 && (
                    <Box xcss={xcss({ marginBlockStart: 'space.200' })}>
                      <Text><Strong>🛡️ Dry-Run Mode:</Strong> No data was deleted. {includesProgress.results.summary.orphanedCount} orphaned Embed(s) found.</Text>
                      <Box xcss={xcss({ marginBlockStart: 'space.100' })}>
                        <Button appearance="warning" onClick={onCleanUpNow}>
                          🧹 Clean Up Now
                        </Button>
                      </Box>
                    </Box>
                  )}

                  {/* Live mode: Show cleanup confirmation */}
                  {!includesProgress.dryRun && includesProgress.results.summary.orphanedEntriesRemoved > 0 && (
                    <Box xcss={xcss({ marginBlockStart: 'space.200' })}>
                      <Text><Strong>🧹 Cleanup Complete:</Strong> {includesProgress.results.summary.orphanedEntriesRemoved} orphaned entry/entries removed and backed up for 90 days.</Text>
                    </Box>
                  )}

                  {/* No orphans found */}
                  {includesProgress.results.summary.orphanedCount === 0 && (
                    <Box xcss={xcss({ marginBlockStart: 'space.200' })}>
                      <Text><Strong>✨ All Clear:</Strong> No orphaned Embeds found.</Text>
                    </Box>
                  )}
                </Fragment>
              )}
            </Fragment>
          ) : (
            /* IN PROGRESS PHASE - Show progress bar and stats */
            <Fragment>
              <Text><Strong>Checking All Embeds...</Strong></Text>
              <Text><Em>⚠️ Please stay on this page until the check completes. Navigating away will cancel the operation.</Em></Text>
              {includesProgress ? (
                <Fragment>
                  <Text>{includesProgress.status || 'Processing...'}</Text>
                  {includesProgress.currentPage && includesProgress.totalPages && (
                    <Text><Em>Page {includesProgress.currentPage} of {includesProgress.totalPages}</Em></Text>
                  )}
                  <ProgressBar value={includesProgress.percent / 100} />
                  <Inline space="space.200" alignBlock="center">
                    <Text><Strong>{includesProgress.percent}%</Strong></Text>
                    {includesProgress.total > 0 && (
                      <Fragment>
                        <Text>|</Text>
                        <Text>{includesProgress.processed} / {includesProgress.total} Embeds processed</Text>
                      </Fragment>
                    )}
                    {includesProgress.processed > 0 && (
                      <Fragment>
                        <Text>|</Text>
                        <Text><Em>{calculateETA(includesProgress)}</Em></Text>
                      </Fragment>
                    )}
                  </Inline>
                </Fragment>
              ) : (
                <Fragment>
                  <Text>Starting check...</Text>
                  <ProgressBar />
                </Fragment>
              )}
            </Fragment>
          )}
        </Stack>
      </SectionMessage>
    </Box>
  );
}
