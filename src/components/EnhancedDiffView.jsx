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
import { Box, Heading, Text, Strong, Em, Stack, Inline, AdfRenderer, Code, Lozenge, Tabs, TabList, Tab, TabPanel, xcss } from '@forge/react';
import { diffLines } from 'diff';
import {
  filterContentByToggles,
  substituteVariablesInAdf,
  cleanAdfForRenderer,
  extractTextWithToggleMarkers
} from '../utils/adf-rendering-utils.js';

// Container styles (no background - now inside green SectionMessage)
const containerStyle = xcss({
  paddingTop: 'space.050',
  width: '100%'
});

// Helper text spacing - more top padding, no bottom padding
const helperTextStyle = xcss({
  paddingTop: 'space.200',
  paddingBottom: 'space.0'
});

// Side columns for preview diff - equal flex-grow for equal widths
const sideBoxStyle = xcss({
  flexGrow: 1,
  flexShrink: 1,  // Allow shrinking to fit side-by-side
  flexBasis: '0%',
  minWidth: 0,  // Critical: allows flex items to shrink below content size
  padding: 'space.200',
  backgroundColor: 'color.background.input',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border'
});

const diffContainerStyle = xcss({
  marginBlock: 'space.200',
  marginTop: 'space.0',  // No top margin since helper text provides spacing
  width: '100%',
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

// Background colors - only neutral lines alternate
const lineAddedBgStyle = xcss({
  backgroundColor: 'color.background.success'  // Consistent light green for all added
});

const lineRemovedBgStyle = xcss({
  backgroundColor: 'color.background.danger'  // Consistent light red for all removed
});

// Neutral lines alternate between light gray and slightly darker gray
const lineUnchangedBgStyle = xcss({
  backgroundColor: 'elevation.surface'  // White/very light
});

const lineUnchangedBgStyleAlt = xcss({
  backgroundColor: 'elevation.surface.sunken'  // Slightly darker gray
});

// Compact padding for the line container
const linePaddingStyle = xcss({
  padding: 'space.050',
  fontFamily: 'monospace',
  fontSize: '12px'
});

// Prefix symbol (+/-/space) - just basic styling
const prefixStyle = xcss({
  fontFamily: 'monospace',
  fontSize: '12px',
  minWidth: '2em'
});

// Text content that can wrap - using Box so it can have specific styling
// flexGrow: 1 makes it take remaining space, containing wrapped text
const contentWrapperStyle = xcss({
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flexGrow: 1,
  minWidth: 0  // Allows flex item to shrink below content size
});

// Margin for preview section with width constraints - allow horizontal scrolling
const previewContainerStyle = xcss({
  marginBlock: 'space.200',
  marginTop: 'space.0',  // No top margin since helper text provides spacing
  width: '100%',
  maxWidth: '100%',
  overflow: 'auto'  // Allow scrolling if content is too wide
});

// Wrapper for ADF content - force block display and constrain width
const adfWrapperStyle = xcss({
  display: 'block',
  width: '100%',
  overflow: 'auto'
});

// Arrow column in the middle - takes minimal natural width
const arrowColumnStyle = xcss({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  flexShrink: 0,  // Don't shrink arrow column
  minHeight: '100%'
});

// Top arrow positioning (offset from top)
const topArrowStyle = xcss({
  marginTop: 'space.400'  // Approximately 1 line-height offset
});

// Bottom arrow positioning (offset from bottom)
const bottomArrowStyle = xcss({
  marginBottom: 'space.400'  // Approximately 1 line-height offset
});

/**
 * Render line-based diff with color coding
 * Green background = added lines
 * Red background = removed lines
 * Gray background = unchanged lines
 */
function renderLineDiff(oldText, newText) {
  const differences = diffLines(oldText || '', newText || '');

  // Track neutral line number for alternating backgrounds (only neutral lines alternate)
  let neutralLineNumber = 0;

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
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text>+</Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
                </Box>
              </Box>
            );
          } else if (part.removed) {
            return (
              <Box key={key} xcss={lineRemovedBgStyle}>
                <Box xcss={linePaddingStyle}>
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text>-</Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
                </Box>
              </Box>
            );
          } else {
            // Unchanged lines alternate
            const isEvenLine = neutralLineNumber % 2 === 0;
            neutralLineNumber++;

            return (
              <Box key={key} xcss={isEvenLine ? lineUnchangedBgStyle : lineUnchangedBgStyleAlt}>
                <Box xcss={linePaddingStyle}>
                  <Inline space="space.0" alignBlock="start">
                    <Box xcss={prefixStyle}>
                      <Text> </Text>
                    </Box>
                    <Box xcss={contentWrapperStyle}>
                      <Text>{line}</Text>
                    </Box>
                  </Inline>
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
    <Box id="enhanced-diff-view-container" xcss={containerStyle}>
      <Stack space="space.200">
        {/* Native Tabs component with proper TabList and TabPanel structure */}
        <Tabs id="diff-view-tabs">
          <TabList>
            <Tab>Line Diff</Tab>
            {/* <Tab>Preview Diff</Tab> */}
          </TabList>

          <TabPanel>
            <Box xcss={xcss({ width: '100%', paddingRight: 'space.300' })}>
              <Stack id="line-diff-tab-panel" space="space.0">
                <Box id="line-diff-helper-text" xcss={helperTextStyle}>
                  <Text>
                    <Em>Line-by-line comparison showing additions (green), removals (red), and unchanged content (gray/white).</Em>
                  </Text>
                </Box>
                <Box id="line-diff-container" xcss={diffContainerStyle}>
                  {renderLineDiff(oldText, newText)}
                </Box>
              </Stack>
            </Box>
          </TabPanel>

          {/* PREVIEW DIFF COMMENTED OUT - TODO: Fix container overflow issues
          <TabPanel>
            <Stack space="space.0">
              <Box xcss={helperTextStyle}>
                <Text>
                  <Em>Changes in disabled toggles are not shown in this preview.</Em>
                </Text>
              </Box>
              <Box xcss={previewContainerStyle}>
                <Inline space="space.100" alignBlock="start">
                  <Box xcss={sideBoxStyle}>
                    <Stack space="space.200">
                      <Lozenge appearance="default">Current</Lozenge>

                      {oldPreviewContent ? (
                        <Box xcss={adfWrapperStyle}>
                          <AdfRenderer document={oldPreviewContent} />
                        </Box>
                      ) : (
                        <Text>
                          <Em>No previous version available</Em>
                        </Text>
                      )}
                    </Stack>
                  </Box>

                  <Box xcss={arrowColumnStyle}>
                    <Box xcss={topArrowStyle}>
                      <Text>→</Text>
                    </Box>
                    <Box>
                      <Text>→</Text>
                    </Box>
                    <Box xcss={bottomArrowStyle}>
                      <Text>→</Text>
                    </Box>
                  </Box>

                  <Box xcss={sideBoxStyle}>
                    <Stack space="space.200">
                      <Lozenge appearance="success">Updated</Lozenge>

                      {newPreviewContent ? (
                        <Box xcss={adfWrapperStyle}>
                          <AdfRenderer document={newPreviewContent} />
                        </Box>
                      ) : (
                        <Text>
                          <Em>No new content available</Em>
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Inline>
              </Box>
            </Stack>
          </TabPanel>
          */}
        </Tabs>
      </Stack>
    </Box>
  );
}
