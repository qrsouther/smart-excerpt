/**
 * CategoryManager Component
 *
 * Modal dialog for managing Blueprint Standard categories. Allows admins to:
 * - Add new categories
 * - Rename existing categories
 * - Delete unused categories
 * - Reorder categories (direct position numbering)
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Array<string>} props.categories - Current list of category names
 * @param {Array} props.excerpts - All excerpts (used to check category usage)
 * @param {Object} props.saveCategoriesMutation - React Query mutation for saving categories
 * @param {string} props.newCategoryName - Input value for new category name
 * @param {Function} props.setNewCategoryName - Callback to update new category name input
 * @param {Function} props.onAddCategory - Handler for adding a new category
 * @param {Function} props.onDeleteCategory - Handler for deleting a category
 * @param {Function} props.onEditCategory - Handler for editing/renaming a category
 * @param {Function} props.onMoveCategoryToPosition - Handler for moving category to specific position
 * @returns {JSX.Element}
 */

import React, { useState } from 'react';
import {
  Text,
  Strong,
  Box,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Stack,
  Inline,
  Button,
  Textfield,
  Icon,
  xcss
} from '@forge/react';

// Category item styling
const categoryItemStyle = xcss({
  padding: 'space.150',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.neutral.subtle'
});

export function CategoryManager({
  isOpen,
  onClose,
  categories,
  excerpts,
  saveCategoriesMutation,
  newCategoryName,
  setNewCategoryName,
  onAddCategory,
  onDeleteCategory,
  onEditCategory,
  onMoveCategoryToPosition
}) {
  // Track position input for each category
  const [positionInputs, setPositionInputs] = useState({});
  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="medium">
          <ModalHeader>
            <ModalTitle>Manage Categories</ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Stack space="space.300">
              {/* Add New Category Input */}
              <Box>
                <Stack space="space.100">
                  <Text><Strong>Add New Category:</Strong></Text>
                  <Inline space="space.100" alignBlock="center">
                    <Textfield
                      placeholder="Enter category name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Button appearance="primary" onClick={onAddCategory}>
                      Add
                    </Button>
                  </Inline>
                </Stack>
              </Box>

              {/* Category List */}
              <Box>
                <Stack space="space.100">
                  {categories.map((category, index) => {
                    const currentPosition = index + 1;
                    const positionInput = positionInputs[category] || currentPosition;

                    return (
                      <Box key={category} xcss={categoryItemStyle}>
                        <Inline space="space.200" alignBlock="center" spread="space-between">
                          <Inline space="space.100" alignBlock="center">
                            <Text><Strong>#{currentPosition}</Strong></Text>
                            <Text><Strong>{category}</Strong></Text>
                          </Inline>
                          <Inline space="space.100" alignBlock="center">
                            <Textfield
                              type="number"
                              value={positionInput}
                              onChange={(e) => {
                                const newPos = parseInt(e.target.value);
                                setPositionInputs(prev => ({
                                  ...prev,
                                  [category]: isNaN(newPos) ? currentPosition : newPos
                                }));
                              }}
                              width="xsmall"
                              min={1}
                              max={categories.length}
                            />
                            <Button
                              appearance="subtle"
                              onClick={() => {
                                const targetPosition = parseInt(positionInput);
                                if (!isNaN(targetPosition) && targetPosition !== currentPosition) {
                                  onMoveCategoryToPosition(category, targetPosition);
                                  // Reset input after move
                                  setPositionInputs(prev => {
                                    const newInputs = { ...prev };
                                    delete newInputs[category];
                                    return newInputs;
                                  });
                                }
                              }}
                              isDisabled={parseInt(positionInput) === currentPosition || isNaN(parseInt(positionInput))}
                            >
                              <Icon glyph="arrow-right" label="Move to Position" />
                            </Button>
                            <Button
                              appearance="subtle"
                              onClick={() => onEditCategory(category)}
                            >
                              <Icon glyph="edit" label="Edit" />
                            </Button>
                            <Button
                              appearance="subtle"
                              onClick={() => onDeleteCategory(category)}
                            >
                              <Icon glyph="trash" label="Delete" />
                            </Button>
                          </Inline>
                        </Inline>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Button onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}
