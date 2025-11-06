/**
 * Enhanced Diff View Component
 *
 * Provides a comprehensive diff view that shows:
 * 1. Word-level text diff with green/red highlighting (GitHub-style)
 * 2. Side-by-side visual preview with ghost mode (disabled toggles visible but grayed)
 *
 * This solves the "apples to oranges" problem where we were comparing rendered
 * content against raw source tags. Now both sides are rendered with the same
 * variable values, but showing ALL content including disabled toggles.
 *
 * Key Features:
 * - Shows changes in disabled toggles (prevents "looks identical" false negatives)
 * - Word-level highlighting for precise change detection
 * - Visual distinction between enabled/disabled content
 * - Maximum disclosure with clear visual markers
 */

import React from 'react';
import { Box, Heading, Text, Strong, Em, Stack, xcss } from '@forge/react';
import { diffLines } from 'diff';
import { AdfRendererWithGhostToggles } from './AdfRendererWithGhostToggles.jsx';
import {
  renderContentWithGhostToggles,
  extractTextWithToggleMarkers
} from '../utils/adf-rendering-utils.js';

// Container styles (no background - now inside green SectionMessage)
const containerStyle = xcss({
  paddingTop: 'space.200'
});

// Two-column layout container
const twoColumnStyle = xcss({
  display: 'flex',
  flexDirection: 'row',
  gap: 'space.300',
  marginTop: 'space.200'
});

// Left and right column styles (50% each)
const columnStyle = xcss({
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  minWidth: '0' // Prevents flex items from overflowing
});

const sideBoxStyle = xcss({
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  padding: 'space.200',
  backgroundColor: 'color.background.input',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border'
});

const diffContainerStyle = xcss({
  marginBlock: 'space.200',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  overflow: 'hidden'
});

// Styles for diff lines
const lineAddedStyle = xcss({
  backgroundColor: 'color.background.success',
  paddingBlock: 'space.050',
  paddingInline: 'space.100',
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
});

const lineRemovedStyle = xcss({
  backgroundColor: 'color.background.danger',
  paddingBlock: 'space.050',
  paddingInline: 'space.100',
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
});

const lineUnchangedStyle = xcss({
  backgroundColor: 'color.background.neutral.subtle',
  paddingBlock: 'space.050',
  paddingInline: 'space.100',
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
});

const previewContainerStyle = xcss({
  display: 'flex',
  gap: 'space.200',
  marginBlock: 'space.200'
});

/**
 * Render line-based diff with color coding
 * Green background = added lines
 * Red background = removed lines
 * Gray background = unchanged lines
 */
function renderLineDiff(oldText, newText) {
  const differences = diffLines(oldText || '', newText || '');

  return (
    <Stack space="space.0">
      {differences.map((part, index) => {
        // Split into individual lines for rendering
        const lines = part.value.split('\n');

        return lines.map((line, lineIndex) => {
          // Skip empty last line from split
          if (lineIndex === lines.length - 1 && line === '') {
            return null;
          }

          const key = `${index}-${lineIndex}`;

          if (part.added) {
            return (
              <Box key={key} xcss={lineAddedStyle}>
                <Text>+ {line}</Text>
              </Box>
            );
          } else if (part.removed) {
            return (
              <Box key={key} xcss={lineRemovedStyle}>
                <Text>- {line}</Text>
              </Box>
            );
          } else {
            return (
              <Box key={key} xcss={lineUnchangedStyle}>
                <Text>  {line}</Text>
              </Box>
            );
          }
        });
      })}
    </Stack>
  );
}

/**
 * Enhanced Diff View Component
 *
 * @param {Object} props
 * @param {Object} props.oldSourceContent - ADF from Source at last sync (stored in syncedContent)
 * @param {Object} props.newSourceContent - Current ADF from Source (latest excerpt.content)
 * @param {Object} props.variableValues - User's current variable values
 * @param {Object} props.toggleStates - User's current toggle states (enabled/disabled)
 * @returns {JSX.Element}
 */
export function EnhancedDiffView({
  oldSourceContent,
  newSourceContent,
  variableValues = {},
  toggleStates = {}
}) {
  // Render BOTH versions with ALL content visible (ghost mode)
  // This applies variable substitutions and marks disabled toggles
  const oldRenderedFull = renderContentWithGhostToggles(
    oldSourceContent,
    variableValues,
    toggleStates
  );

  const newRenderedFull = renderContentWithGhostToggles(
    newSourceContent,
    variableValues,
    toggleStates
  );

  // Convert to text for side-by-side comparison
  // Includes markers like [DISABLED TOGGLE: name] for visual distinction
  const oldText = extractTextWithToggleMarkers(oldRenderedFull, toggleStates);
  const newText = extractTextWithToggleMarkers(newRenderedFull, toggleStates);

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.200">
        {/* Two-column layout: Line diff (left) and Visual preview (right) */}
        <Box xcss={twoColumnStyle}>
          {/* LEFT COLUMN: Line-based diff with color coding */}
          <Box xcss={columnStyle}>
            <Stack space="space.200">
              <Box>
                <Heading size="small">Changes in This Update</Heading>
                <Text>
                  Line-by-line comparison showing additions (green), removals (red), and unchanged content (gray).
                </Text>
              </Box>

              <Box xcss={diffContainerStyle}>
                {renderLineDiff(oldText, newText)}
              </Box>
            </Stack>
          </Box>

          {/* RIGHT COLUMN: Visual preview */}
          <Box xcss={columnStyle}>
            <Stack space="space.200">
              <Box>
                <Heading size="small">Visual Preview</Heading>
                <Text>
                  Rendered content with ghost mode. Gray text = disabled toggles.
                </Text>
              </Box>

              <Box xcss={previewContainerStyle}>
                {/* Old version */}
                <Box xcss={sideBoxStyle}>
                  <Stack space="space.100">
                    <Text>
                      <Strong>Current</Strong>
                    </Text>

                    {oldSourceContent ? (
                      <AdfRendererWithGhostToggles
                        content={oldRenderedFull}
                        toggleStates={toggleStates}
                      />
                    ) : (
                      <Text>
                        <Em>No previous sync</Em>
                      </Text>
                    )}
                  </Stack>
                </Box>

                {/* New version */}
                <Box xcss={sideBoxStyle}>
                  <Stack space="space.100">
                    <Text>
                      <Strong>Updated</Strong>
                    </Text>

                    <AdfRendererWithGhostToggles
                      content={newRenderedFull}
                      toggleStates={toggleStates}
                    />
                  </Stack>
                </Box>
              </Box>
            </Stack>
          </Box>
        </Box>

        {/* Legend for visual markers */}
        <Box xcss={xcss({ padding: 'space.200', backgroundColor: 'color.background.information', borderRadius: 'border.radius' })}>
          <Stack space="space.100">
            <Text>
              <Strong>Legend:</Strong>
            </Text>
            <Text>• ✓ = Enabled toggle (active in your Embed) • 🔲 = Disabled toggle (shown but not active)</Text>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
