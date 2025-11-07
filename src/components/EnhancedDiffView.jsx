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

import React, { useState } from 'react';
import { Box, Heading, Text, Strong, Em, Stack, Button, ButtonGroup, AdfRenderer, Code, xcss } from '@forge/react';
import { diffLines } from 'diff';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  cleanAdfForRenderer,
  extractTextWithToggleMarkers
} from '../utils/adf-rendering-utils.js';

// Container styles (no background - now inside green SectionMessage)
const containerStyle = xcss({
  paddingTop: 'space.050'
});

// Horizontal separator line
const separatorStyle = xcss({
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border',
  marginBlock: 'space.150'
});

// View switcher button group container (centered, no gap for joined appearance)
const viewSwitcherStyle = xcss({
  display: 'flex',
  justifyContent: 'center',
  gap: '0'
});

// Left button style (Line Diff) - no right border, square right corners
const leftButtonStyle = xcss({
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  minWidth: '0',
  borderRightWidth: '0',
  borderTopRightRadius: '0',
  borderBottomRightRadius: '0'
});

// Right button style (Preview Diff) - no left border, square left corners
const rightButtonStyle = xcss({
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  minWidth: '0',
  borderLeftWidth: '0',
  borderTopLeftRadius: '0',
  borderBottomLeftRadius: '0'
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
  overflow: 'hidden',
  backgroundColor: 'elevation.surface' // White/neutral background for diff content
});

// SOLUTION: Separate background from padding using nested Boxes
// Outer Box: background color ONLY (no padding)
// Inner Box: padding, text-indent, font styles (no background)

const lineAddedBgStyle = xcss({
  backgroundColor: 'color.background.success'
});

const lineRemovedBgStyle = xcss({
  backgroundColor: 'color.background.warning'  // danger token breaks rendering
});

const lineUnchangedBgStyle = xcss({
  backgroundColor: 'color.background.neutral.subtle'
});

// Padding style for inner Box (no textIndent - not supported in Forge!)
const linePaddingStyle = xcss({
  paddingBlock: 'space.050',
  paddingInline: 'space.100',
  display: 'flex',
  flexDirection: 'row',
  fontFamily: 'monospace',
  fontSize: '12px'
});

// Prefix symbol (+/-/space) with fixed width
const prefixStyle = xcss({
  flexShrink: 0,
  width: '2em',
  fontFamily: 'monospace',
  fontSize: '12px'
});

// Text content that can wrap
const contentStyle = xcss({
  flexGrow: 1,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
  fontSize: '12px'
});

// Two-column layout for preview diff (side-by-side)
const previewContainerStyle = xcss({
  display: 'flex',
  flexDirection: 'row',
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
              <Box key={key} xcss={lineAddedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Box xcss={prefixStyle}>
                    <Text>+</Text>
                  </Box>
                  <Box xcss={contentStyle}>
                    <Text>{line}</Text>
                  </Box>
                </Box>
              </Box>
            );
          } else if (part.removed) {
            return (
              <Box key={key} xcss={lineRemovedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Box xcss={prefixStyle}>
                    <Text>-</Text>
                  </Box>
                  <Box xcss={contentStyle}>
                    <Text>{line}</Text>
                  </Box>
                </Box>
              </Box>
            );
          } else {
            return (
              <Box key={key} xcss={lineUnchangedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Box xcss={prefixStyle}>
                    <Text> </Text>
                  </Box>
                  <Box xcss={contentStyle}>
                    <Text>{line}</Text>
                  </Box>
                </Box>
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
  // State for toggling between line-based diff and preview diff
  const [showPreview, setShowPreview] = useState(false);

  // Render content with variables substituted and only enabled toggles (for preview)
  const renderForPreview = (content) => {
    if (!content) return null;
    let rendered = filterContentByToggles(content, toggleStates);
    rendered = substituteVariablesInAdf(rendered, variableValues);
    return cleanAdfForRenderer(rendered);
  };

  const oldPreviewContent = renderForPreview(oldSourceContent);
  const newPreviewContent = renderForPreview(newSourceContent);

  // For line-based diff: apply variables and mark toggles, then extract text
  const renderForLineDiff = (content) => {
    if (!content) return '';
    // Apply variable substitutions
    let rendered = substituteVariablesInAdf(content, variableValues);
    // Extract text with toggle markers (shows ALL toggles including disabled)
    return extractTextWithToggleMarkers(rendered, toggleStates);
  };

  const oldText = renderForLineDiff(oldSourceContent);
  const newText = renderForLineDiff(newSourceContent);

  return (
    <Box xcss={containerStyle}>
      <Stack space="space.200">
        {/* Horizontal separator line */}
        <Box xcss={separatorStyle} />

        {/* View switcher: Two wide buttons joined as split button */}
        <Box xcss={viewSwitcherStyle}>
          <Button
            xcss={leftButtonStyle}
            appearance={!showPreview ? 'primary' : 'default'}
            onClick={() => setShowPreview(false)}
          >
            Line Diff
          </Button>
          <Button
            xcss={rightButtonStyle}
            appearance={showPreview ? 'primary' : 'default'}
            onClick={() => setShowPreview(true)}
          >
            Preview Diff
          </Button>
        </Box>

        {/* Conditional rendering: Line-based diff OR Preview diff */}
        {!showPreview ? (
          /* LINE-BASED DIFF (default view) */
          <Stack space="space.100">
            <Text>
              Line-by-line comparison showing additions (green), removals (red), and unchanged content (gray).
              Includes all content, even from disabled toggles.
            </Text>

            <Box xcss={diffContainerStyle}>
              {renderLineDiff(oldText, newText)}
            </Box>
          </Stack>
        ) : (
          /* PREVIEW DIFF (toggled view) */
          <Stack space="space.200">
            <Box>
              <Heading size="small">Visual Preview</Heading>
              <Text>
                Side-by-side comparison of rendered content. Shows only enabled toggles.
              </Text>
            </Box>

            {/* Warning about disabled toggles */}
            <Box xcss={xcss({ padding: 'space.200', backgroundColor: 'color.background.warning', borderRadius: 'border.radius' })}>
              <Text>
                <Strong>Note:</Strong> Changes in disabled toggles are not shown in this preview.
                Toggle back to line-by-line diff to see all changes including disabled toggle content.
              </Text>
            </Box>

            <Box xcss={previewContainerStyle}>
              {/* Left: Current rendered content */}
              <Box xcss={sideBoxStyle}>
                <Stack space="space.200">
                  <Text>
                    <Strong>Current (What You See Now)</Strong>
                  </Text>

                  {oldPreviewContent ? (
                    <AdfRenderer document={oldPreviewContent} />
                  ) : (
                    <Text>
                      <Em>No previous version available</Em>
                    </Text>
                  )}
                </Stack>
              </Box>

              {/* Right: Updated rendered content */}
              <Box xcss={sideBoxStyle}>
                <Stack space="space.200">
                  <Text>
                    <Strong>Updated (What You'll See After Update)</Strong>
                  </Text>

                  {newPreviewContent ? (
                    <AdfRenderer document={newPreviewContent} />
                  ) : (
                    <Text>
                      <Em>No new content available</Em>
                    </Text>
                  )}
                </Stack>
              </Box>
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
