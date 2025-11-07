/**
 * ExcerptPreviewModal Component
 *
 * Modal dialog for previewing the raw ADF content of a Blueprint Standard Source.
 * Shows the content with variables (in double curly braces) and toggle tags,
 * helping admins understand the template structure before it's customized in Embeds.
 *
 * @param {Object} props
 * @param {string|null} props.showPreviewModal - Excerpt ID to preview, or null if modal is closed
 * @param {Function} props.setShowPreviewModal - Callback to update preview state
 * @param {Array} props.excerpts - Array of all excerpt objects
 * @param {Object} props.previewBoxStyle - xcss style for the preview content box
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Text,
  Box,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Stack,
  Button,
  SectionMessage,
  AdfRenderer
} from '@forge/react';

export function ExcerptPreviewModal({
  showPreviewModal,
  setShowPreviewModal,
  excerpts,
  previewBoxStyle
}) {
  return (
    <ModalTransition>
      {showPreviewModal && (() => {
        const excerpt = excerpts.find(e => e.id === showPreviewModal);
        if (!excerpt) return null;

        return (
          <Modal width="x-large" onClose={() => setShowPreviewModal(null)}>
            <ModalHeader>
              <ModalTitle>Preview: {excerpt.name}</ModalTitle>
            </ModalHeader>

            <ModalBody>
              <Stack space="space.200">
                {/* Helper Text */}
                <SectionMessage appearance="information">
                  <Stack space="space.100">
                    <Text>
                      The following preview is pulled from the Blueprint Standard - Source macro's body content. The variables (in double curly braces) are filled out by users via the Blueprint Standard - Embed macros.
                    </Text>
                    <Text>
                      The toggle tags allow users to opt into certain settings or options within each excerpted solution, and by enabling a toggle all content that exists in the space between the opening toggle tag and closing toggle tag is revealed within the Embed macro. Variables can be defined within toggles as well; as a result, generally a variable that is utilized ONLY within a toggle in a given Source macro will be optional rather than required.
                    </Text>
                    <Text>
                      Click on View Source to make changes to the body content of the Source macro.
                    </Text>
                  </Stack>
                </SectionMessage>

                <Box xcss={previewBoxStyle}>
                  {excerpt.content && typeof excerpt.content === 'object' ? (
                    <AdfRenderer document={excerpt.content} />
                  ) : (
                    <Text>{excerpt.content || 'No content stored'}</Text>
                  )}
                </Box>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <Button onClick={() => setShowPreviewModal(null)}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        );
      })()}
    </ModalTransition>
  );
}
