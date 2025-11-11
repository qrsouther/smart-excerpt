/**
 * EmbedEditMode Component
 *
 * Renders the Embed in edit mode with configuration tabs and live preview.
 * Provides tabbed interface for configuring variables, toggles, and custom content.
 *
 * Features:
 * - Standard selector dropdown at top
 * - Header with standard name and "View Source" link
 * - Save status indicator (Saving/Saved)
 * - Three tabs: Write (variables), Toggles, Custom (insertions/notes)
 * - Live preview below tabs (updates as configuration changes)
 * - Preview mode switches based on selected tab (rendered vs raw with markers)
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The selected Blueprint Standard (Source) object
 * @param {Array} props.availableExcerpts - List of all available Standards
 * @param {boolean} props.isLoadingExcerpts - Whether Standards list is loading
 * @param {string} props.selectedExcerptId - ID of currently selected Standard
 * @param {Function} props.handleExcerptSelection - Handler for Standard selection change
 * @param {Object} props.context - Forge context object
 * @param {string} props.saveStatus - Current save status ('saving'|'saved'|null)
 * @param {number} props.selectedTabIndex - Currently selected tab index (0=Write, 1=Toggles, 2=Custom)
 * @param {Function} props.setSelectedTabIndex - Handler to change selected tab
 * @param {Object} props.variableValues - Current variable values
 * @param {Function} props.setVariableValues - Update variable values
 * @param {Object} props.toggleStates - Current toggle states
 * @param {Function} props.setToggleStates - Update toggle states
 * @param {Array} props.customInsertions - Custom paragraph insertions
 * @param {Function} props.setCustomInsertions - Update custom insertions
 * @param {Array} props.internalNotes - Internal notes
 * @param {Function} props.setInternalNotes - Update internal notes
 * @param {string} props.insertionType - Type of insertion being added
 * @param {Function} props.setInsertionType - Update insertion type
 * @param {string} props.selectedPosition - Selected position for insertion
 * @param {Function} props.setSelectedPosition - Update selected position
 * @param {string} props.customText - Custom text input
 * @param {Function} props.setCustomText - Update custom text
 * @param {Function} props.getPreviewContent - Get rendered preview content
 * @param {Function} props.getRawPreviewContent - Get raw preview with markers
 * @returns {JSX.Element} - Edit mode JSX
 */

import React, { Fragment } from 'react';
import {
  Text,
  Em,
  Heading,
  Button,
  Stack,
  Inline,
  Box,
  Spinner,
  Select,
  Icon,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  AdfRenderer
} from '@forge/react';
import { router, view } from '@forge/bridge';
import { VariableConfigPanel } from '../VariableConfigPanel';
import { ToggleConfigPanel } from '../ToggleConfigPanel';
import { CustomInsertionsPanel } from '../CustomInsertionsPanel';
import { DocumentationLinksDisplay } from './DocumentationLinksDisplay';
import {
  excerptSelectorStyle,
  previewBoxStyle,
  adfContentContainerStyle
} from '../../styles/embed-styles';

export function EmbedEditMode({
  excerpt,
  availableExcerpts,
  isLoadingExcerpts,
  selectedExcerptId,
  handleExcerptSelection,
  context,
  saveStatus,
  selectedTabIndex,
  setSelectedTabIndex,
  variableValues,
  setVariableValues,
  toggleStates,
  setToggleStates,
  customInsertions,
  setCustomInsertions,
  internalNotes,
  setInternalNotes,
  insertionType,
  setInsertionType,
  selectedPosition,
  setSelectedPosition,
  customText,
  setCustomText,
  getPreviewContent,
  getRawPreviewContent
}) {
  // Use different preview based on selected tab
  // Write tab (0): Rendered without markers
  // Toggles tab (1): Raw with markers
  // Custom tab (2): Raw with markers
  const previewContent = (selectedTabIndex === 1 || selectedTabIndex === 2)
    ? getRawPreviewContent()
    : getPreviewContent();
  const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

  return (
    <Stack space="space.100">
      {/* Excerpt Selector - always visible at top of edit mode */}
      <Box xcss={excerptSelectorStyle}>
        {isLoadingExcerpts ? (
          <Spinner size="small" label="Loading..." />
        ) : (
          <Select
            options={availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            }))}
            value={availableExcerpts.map(ex => ({
              label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
              value: ex.id
            })).find(opt => opt.value === selectedExcerptId)}
            onChange={handleExcerptSelection}
            placeholder="Choose a standard..."
          />
        )}
      </Box>

      <Inline space="space.300" alignBlock="center" spread="space-between">
        <Inline space="space.100" alignBlock="center">
          <Heading size="large">{excerpt.name}</Heading>
          <Button
            appearance="link"
            onClick={async () => {
              try {
                // Navigate to the source page where this excerpt is defined
                const pageId = excerpt.sourcePageId || excerpt.pageId;
                // Use excerpt's space key, or fallback to current space key
                const spaceKey = excerpt.sourceSpaceKey || context?.extension?.space?.key || context?.spaceKey;

                if (pageId && spaceKey) {
                  // Build the URL manually since we have both pageId and spaceKey
                  const url = `/wiki/spaces/${spaceKey}/pages/${pageId}`;
                  await router.open(url);
                } else if (pageId) {
                  // Fallback: Try using view.createContentLink if we only have pageId
                  const contentLink = await view.createContentLink({
                    contentType: 'page',
                    contentId: pageId
                  });
                  await router.open(contentLink);
                }
              } catch (err) {
                console.error('[VIEW-SOURCE] Navigation error:', err);
              }
            }}
          >
            View Source
          </Button>
        </Inline>
        <Inline space="space.100" alignBlock="center">
          {saveStatus === 'saving' && (
            <Fragment>
              <Spinner size="small" label="Saving" />
              <Text><Em>Saving...</Em></Text>
            </Fragment>
          )}
          {saveStatus === 'saved' && (
            <Fragment>
              <Icon glyph="check-circle" size="small" label="Saved" />
              <Text><Em>Saved</Em></Text>
            </Fragment>
          )}
        </Inline>
      </Inline>

      <Tabs onChange={(index) => setSelectedTabIndex(index)}>
        <TabList>
          <Tab>Write</Tab>
          <Tab>Toggles</Tab>
          <Tab>Custom</Tab>
        </TabList>
        {/* Write Tab - Variables */}
        <TabPanel>
          <VariableConfigPanel
            excerpt={excerpt}
            variableValues={variableValues}
            setVariableValues={setVariableValues}
          />
        </TabPanel>

        {/* Toggles Tab */}
        <TabPanel>
          <ToggleConfigPanel
            excerpt={excerpt}
            toggleStates={toggleStates}
            setToggleStates={setToggleStates}
          />
        </TabPanel>

        {/* Custom Tab - Custom paragraph insertions and internal notes */}
        <TabPanel>
          <CustomInsertionsPanel
            excerpt={excerpt}
            variableValues={variableValues}
            toggleStates={toggleStates}
            customInsertions={customInsertions}
            setCustomInsertions={setCustomInsertions}
            internalNotes={internalNotes}
            setInternalNotes={setInternalNotes}
            insertionType={insertionType}
            setInsertionType={setInsertionType}
            selectedPosition={selectedPosition}
            setSelectedPosition={setSelectedPosition}
            customText={customText}
            setCustomText={setCustomText}
          />
        </TabPanel>
      </Tabs>

      {/* Preview - Always visible below tabs */}
      <Stack space="space.100">
        <DocumentationLinksDisplay documentationLinks={excerpt?.documentationLinks} />
        <Box xcss={previewBoxStyle}>
          {isAdf ? (
            <Box xcss={adfContentContainerStyle}>
              <AdfRenderer document={previewContent} />
            </Box>
          ) : (
            <Text>{previewContent || 'No content'}</Text>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
