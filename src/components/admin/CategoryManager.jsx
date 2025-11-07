/**
 * CategoryManager Component
 *
 * Modal dialog for managing Blueprint Standard categories. Allows admins to:
 * - Add new categories
 * - Rename existing categories
 * - Delete unused categories
 * - Reorder categories (move up/down)
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
 * @param {Function} props.onMoveCategoryUp - Handler for moving a category up
 * @param {Function} props.onMoveCategoryDown - Handler for moving a category down
 * @returns {JSX.Element}
 */

import React from 'react';
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
  onMoveCategoryUp,
  onMoveCategoryDown
}) {
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
                  {categories.map((category, index) => (
                    <Box key={category} xcss={categoryItemStyle}>
                      <Inline space="space.200" alignBlock="center" spread="space-between">
                        <Text><Strong>{category}</Strong></Text>
                        <Inline space="space.100" alignBlock="center">
                          <Button
                            appearance="subtle"
                            onClick={() => onMoveCategoryUp(category)}
                            isDisabled={index === 0}
                          >
                            <Icon glyph="arrow-up" label="Move Up" />
                          </Button>
                          <Button
                            appearance="subtle"
                            onClick={() => onMoveCategoryDown(category)}
                            isDisabled={index === categories.length - 1}
                          >
                            <Icon glyph="arrow-down" label="Move Down" />
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
                  ))}
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
