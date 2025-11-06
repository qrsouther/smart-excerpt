/**
 * ADF Renderer with Ghost Toggle Mode
 *
 * Renders ADF content with ALL toggle blocks visible, including disabled ones.
 * Disabled toggle content is styled with gray text and visual markers to indicate
 * it's not currently active in the user's configuration.
 *
 * Used in Enhanced Diff View to show changes in disabled toggles that would otherwise
 * be invisible.
 *
 * Features:
 * - Renders all content (enabled and disabled toggles)
 * - Visual distinction: enabled (normal) vs disabled (gray italic)
 * - Toggle markers: ✓ (enabled) vs 🔲 (disabled)
 * - Lozenge badges to indicate status
 */

import React from 'react';
import { Box, Text, Em, Strong, Lozenge, xcss } from '@forge/react';

// Styles for disabled toggle blocks
const disabledToggleStyle = xcss({
  opacity: '0.5',
  borderLeft: '3px dashed',
  borderColor: 'color.border',
  paddingLeft: 'space.200',
  marginBlock: 'space.100',
  backgroundColor: 'color.background.neutral'
});

// Style for content inside disabled toggles (gray italic)
const grayContentStyle = xcss({
  color: 'color.text.subtlest',
  fontStyle: 'italic'
});

// Styles for enabled toggle blocks
const enabledToggleStyle = xcss({
  borderLeft: '3px solid',
  borderColor: 'color.border.success',
  paddingLeft: 'space.200',
  marginBlock: 'space.100'
});

// Style for panel blocks
const panelStyle = xcss({
  borderLeft: '3px solid',
  borderColor: 'color.border.information',
  paddingLeft: 'space.200',
  marginBlock: 'space.100',
  backgroundColor: 'color.background.information'
});

/**
 * ADF Renderer with Ghost Toggles
 *
 * @param {Object} props
 * @param {Object} props.content - ADF content to render (should already have disabled toggles marked)
 * @param {Object} props.toggleStates - Toggle states (enabled/disabled) for reference
 * @returns {JSX.Element}
 */
export function AdfRendererWithGhostToggles({ content, toggleStates }) {
  /**
   * Render a single ADF node
   */
  function renderNode(node, key) {
    if (!node) return null;

    // Paragraph
    if (node.type === 'paragraph') {
      return (
        <Box key={key} xcss={xcss({ marginBlock: 'space.100' })}>
          <Text>
            {node.content?.map((child, idx) => renderInlineContent(child, idx))}
          </Text>
        </Box>
      );
    }

    // Heading
    if (node.type === 'heading') {
      const level = node.attrs?.level || 1;
      return (
        <Box key={key} xcss={xcss({ marginBlock: 'space.200' })}>
          <Text>
            <Strong>
              {'#'.repeat(level)} {node.content?.map((child, idx) => renderInlineContent(child, idx))}
            </Strong>
          </Text>
        </Box>
      );
    }

    // Toggle block (expand node)
    if (node.type === 'expand') {
      const toggleMatch = node.attrs?.title?.match(/\{\{toggle:([^}]+)\}\}/);
      const toggleName = toggleMatch ? toggleMatch[1] : node.attrs?.title || 'unknown';
      const isDisabled = node.attrs?.['data-disabled-toggle'] || !toggleStates[toggleName];

      return (
        <Box
          key={key}
          xcss={isDisabled ? disabledToggleStyle : enabledToggleStyle}
        >
          {/* Toggle header with status indicator */}
          <Box xcss={xcss({ marginBottom: 'space.100' })}>
            <Text>
              {isDisabled ? '🔲' : '✓'}{' '}
              <Em>{toggleName}</Em>
              {' '}
              {isDisabled && <Lozenge appearance="removed">Not in your version</Lozenge>}
            </Text>
          </Box>

          {/* Toggle content (grayed out if disabled) */}
          <Box xcss={isDisabled ? grayContentStyle : undefined}>
            {node.content?.map((child, idx) => renderNode(child, idx))}
          </Box>
        </Box>
      );
    }

    // Panel
    if (node.type === 'panel') {
      return (
        <Box key={key} xcss={panelStyle}>
          {node.content?.map((child, idx) => renderNode(child, idx))}
        </Box>
      );
    }

    // Bullet list
    if (node.type === 'bulletList') {
      return (
        <Box key={key} xcss={xcss({ marginBlock: 'space.100', paddingLeft: 'space.300' })}>
          {node.content?.map((item, idx) => (
            <Box key={idx} xcss={xcss({ display: 'flex', marginBlock: 'space.050' })}>
              <Text>• </Text>
              <Box>
                {item.content?.map((child, childIdx) => renderNode(child, childIdx))}
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    // Ordered list
    if (node.type === 'orderedList') {
      return (
        <Box key={key} xcss={xcss({ marginBlock: 'space.100', paddingLeft: 'space.300' })}>
          {node.content?.map((item, idx) => (
            <Box key={idx} xcss={xcss({ display: 'flex', marginBlock: 'space.050' })}>
              <Text>{idx + 1}. </Text>
              <Box>
                {item.content?.map((child, childIdx) => renderNode(child, childIdx))}
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    // Table
    if (node.type === 'table') {
      return (
        <Box key={key} xcss={xcss({ marginBlock: 'space.200', borderWidth: 'border.width', borderStyle: 'solid', borderColor: 'color.border' })}>
          {node.content?.map((row, rowIdx) => (
            <Box key={rowIdx} xcss={xcss({ display: 'flex', borderBottom: 'border.width solid', borderColor: 'color.border' })}>
              {row.content?.map((cell, cellIdx) => (
                <Box key={cellIdx} xcss={xcss({ flex: '1', padding: 'space.100' })}>
                  {cell.content?.map((child, childIdx) => renderNode(child, childIdx))}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
    }

    // Fallback for other node types - recursively render children
    if (node.content && Array.isArray(node.content)) {
      return (
        <Box key={key}>
          {node.content.map((child, idx) => renderNode(child, idx))}
        </Box>
      );
    }

    return null;
  }

  /**
   * Render inline content (text with marks)
   */
  function renderInlineContent(node, key) {
    if (!node) return null;

    if (node.type === 'text') {
      let textNode = node.text;

      // Apply text marks (bold, italic, etc.)
      if (node.marks && Array.isArray(node.marks)) {
        node.marks.forEach(mark => {
          if (mark.type === 'strong') {
            textNode = <Strong key={key}>{textNode}</Strong>;
          }
          if (mark.type === 'em') {
            textNode = <Em key={key}>{textNode}</Em>;
          }
          if (mark.type === 'code') {
            textNode = <code key={key}>{textNode}</code>;
          }
        });
      }

      return <span key={key}>{textNode}</span>;
    }

    if (node.type === 'hardBreak') {
      return <br key={key} />;
    }

    return null;
  }

  // Render root content
  return (
    <Box>
      {content?.content?.map((node, idx) => renderNode(node, idx))}
    </Box>
  );
}
