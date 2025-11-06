/**
 * Variable Configuration Panel
 *
 * Component for the "Write" tab that displays variable input fields.
 * Allows users to fill in required and optional variables for a Blueprint Standard embed.
 *
 * Features:
 * - Required field indicators with asterisks
 * - Warning icons for missing required fields
 * - Tooltips for variable descriptions
 * - Visual status indicators (filled/empty/required)
 * - Auto-saving via parent component
 */

import React from 'react';
import {
  Text,
  Strong,
  Code,
  Textfield,
  Inline,
  Tooltip,
  Icon,
  DynamicTable,
  Box,
  xcss
} from '@forge/react';

// Style for full-width variable table container
const variableBoxStyle = xcss({
  width: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

// Style for required field warning border
const requiredFieldStyle = xcss({
  borderColor: 'color.border.warning',
  borderWidth: 'border.width.outline',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.050'
});

/**
 * VariableConfigPanel Component
 *
 * @param {Object} props
 * @param {Object} props.excerpt - The Blueprint Standard/excerpt object containing variables
 * @param {Object} props.variableValues - Current values for all variables (map of name -> value)
 * @param {Function} props.setVariableValues - Function to update variable values
 * @returns {JSX.Element}
 */
export const VariableConfigPanel = ({ excerpt, variableValues, setVariableValues }) => {
  // If no variables defined, show empty state
  if (!excerpt.variables || excerpt.variables.length === 0) {
    return <Text>No variables defined for this standard.</Text>;
  }

  return (
    <Box xcss={variableBoxStyle}>
      <DynamicTable
        head={{
          cells: [
            {
              key: 'variable',
              content: 'Variable',
              width: 20
            },
            {
              key: 'value',
              content: 'Value',
              width: 75
            },
            {
              key: 'status',
              content: 'Status',
              width: 5
            }
          ]
        }}
        rows={excerpt.variables.map(variable => {
          const isRequired = variable.required || false;
          const isEmpty = !variableValues[variable.name] || variableValues[variable.name].trim() === '';
          const showWarning = isRequired && isEmpty;

          return {
            key: variable.name,
            cells: [
              {
                key: 'variable',
                content: (
                  <Inline space="space.050" alignBlock="center">
                    {isRequired && <Text><Strong>*</Strong></Text>}
                    <Text><Code>{variable.name}</Code></Text>
                    {variable.description && (
                      <Tooltip content={variable.description} position="right">
                        <Icon glyph="question-circle" size="small" label="" />
                      </Tooltip>
                    )}
                    {showWarning && (
                      <Tooltip content="This field is required. Please provide a value." position="right">
                        <Icon glyph="warning" size="small" label="Required field" color="color.icon.warning" />
                      </Tooltip>
                    )}
                  </Inline>
                )
              },
              {
                key: 'value',
                content: (
                  <Box xcss={showWarning ? requiredFieldStyle : undefined}>
                    <Textfield
                      placeholder={variable.example ? `e.g., ${variable.example}` : `Enter value for ${variable.name}`}
                      value={variableValues[variable.name] || ''}
                      onChange={(e) => {
                        setVariableValues({
                          ...variableValues,
                          [variable.name]: e.target.value
                        });
                      }}
                    />
                  </Box>
                )
              },
              {
                key: 'status',
                content: (
                  isEmpty ? (
                    isRequired ? (
                      <Icon glyph="checkbox-unchecked" label="Required - Empty" color="color.icon.danger" />
                    ) : (
                      <Icon glyph="checkbox-unchecked" label="Optional - Empty" color="color.icon.subtle" />
                    )
                  ) : (
                    <Icon glyph="check-circle" label="Filled" color="color.icon.success" />
                  )
                )
              }
            ]
          };
        })}
      />
    </Box>
  );
};
