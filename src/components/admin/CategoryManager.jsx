/**
 * CategoryManager Component
 *
 * Modal dialog for managing Blueprint Standard categories. Allows admins to:
 * - Add new categories
 * - Rename existing categories
 * - Delete unused categories
 * - Reorder categories (up/down arrows)
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

import React, { useState, useEffect } from 'react';
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
  DynamicTable
} from '@forge/react';

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
  // Local state: maintain category order in component until user saves
  const [localCategories, setLocalCategories] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize local state when modal opens
  // Use initialization flag to prevent resetting during re-renders
  useEffect(() => {
    if (isOpen && !isInitialized) {
      setLocalCategories([...categories]);
      setHasChanges(false);
      setIsInitialized(true);
    } else if (!isOpen && isInitialized) {
      // Reset initialization flag when modal closes
      setIsInitialized(false);
    }
  }, [isOpen, categories, isInitialized]);

  // Handle drag-and-drop reordering from DynamicTable
  const handleRankEnd = ({ sourceIndex, sourceKey, destination }) => {
    // Use destination.index directly - it's already the correct 0-based array index
    // for where to insert AFTER the source item is removed
    const destinationIndex = destination?.index ?? 0;

    const newCategories = [...localCategories];
    const [removed] = newCategories.splice(sourceIndex, 1);
    newCategories.splice(destinationIndex, 0, removed);

    setLocalCategories(newCategories);
    setHasChanges(true);
  };

  // Save the final category order
  const handleSave = () => {
    saveCategoriesMutation.mutate(localCategories);
    onClose();
  };

  // Convert categories to DynamicTable row format
  // Use index as part of key to force re-render when order changes
  const tableRows = localCategories.map((category, index) => ({
    key: `${category}-${index}`,
    cells: [
      {
        key: 'position',
        content: <Text>{index + 1}</Text>
      },
      {
        key: 'name',
        content: <Text>{category}</Text>
      },
      {
        key: 'actions',
        content: (
          <Inline space="space.050">
            <Button
              appearance="subtle"
              onClick={() => onEditCategory(category)}
              spacing="compact"
            >
              <Icon glyph="edit" label="Edit" />
            </Button>
            <Button
              appearance="subtle"
              onClick={() => onDeleteCategory(category)}
              spacing="compact"
            >
              <Icon glyph="trash" label="Delete" />
            </Button>
          </Inline>
        )
      }
    ]
  }));

  const tableHead = {
    cells: [
      {
        key: 'position',
        content: <Text><Strong>Priority</Strong></Text>
      },
      {
        key: 'name',
        content: <Text><Strong>Category</Strong></Text>
      },
      {
        key: 'actions',
        content: <Text><Strong>Actions</Strong></Text>
      }
    ]
  };
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
                  <Inline space="space.100" alignBlock="center">
                    <Textfield
                      placeholder="Add a new Category..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <Button appearance="primary" onClick={onAddCategory}>
                      Add
                    </Button>
                  </Inline>
                </Stack>
              </Box>

              {/* Category List with Drag-and-Drop */}
              <Box>
                <DynamicTable
                  head={tableHead}
                  rows={tableRows}
                  isRankable
                  onRankEnd={handleRankEnd}
                />
              </Box>
            </Stack>
          </ModalBody>

          <ModalFooter>
            <Inline space="space.100">
              <Button onClick={onClose}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleSave}>
                Save
              </Button>
            </Inline>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}
