/**
 * StableTextfield Component
 *
 * A wrapper around Forge's Textfield component that prevents cursor jumping
 * by using an uncontrolled component pattern with ref synchronization.
 *
 * Based on the pattern used in RedlineQueueCard's CommentTextArea component.
 *
 * This component:
 * - Uses uncontrolled pattern (defaultValue) to prevent re-renders on every keystroke
 * - Syncs ref value when value prop changes externally (e.g., when parent state resets)
 * - Uses React.memo with custom comparison to prevent unnecessary re-renders
 * - Maintains a stable key to prevent component recreation
 *
 * Usage:
 * <StableTextfield
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 *   placeholder="Enter text..."
 *   stableKey="unique-field-id"
 *   // ... other Textfield props
 * />
 *
 * @param {Object} props - All props are passed through to Textfield
 * @param {string} props.stableKey - Unique key for this field (required for proper memoization)
 * @param {string} props.value - Controlled value (synced to ref when changed externally)
 * @param {Function} props.onChange - Change handler
 * @returns {JSX.Element}
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Textfield } from '@forge/react';

// Isolated Textfield component to prevent cursor jumping
// Uses uncontrolled component pattern with ref to maintain cursor position
const StableTextfieldComponent = React.forwardRef(({ 
  stableKey,
  value,
  onChange,
  ...otherProps 
}, ref) => {
  const textFieldRef = useRef(null);
  
  // Combine internal ref with forwarded ref
  React.useImperativeHandle(ref, () => textFieldRef.current, []);
  
  // Sync ref value when value prop changes externally (e.g., when parent state resets)
  // Only sync when value actually changes, not on every render
  useEffect(() => {
    if (textFieldRef.current && textFieldRef.current.value !== value) {
      textFieldRef.current.value = value || '';
    }
  }, [value, stableKey]); // Only sync when value or stableKey changes
  
  // Handle change events
  const handleChange = useCallback((e) => {
    if (onChange) {
      onChange(e);
    }
  }, [onChange]);
  
  return (
    <Textfield
      key={stableKey || `stable-textfield-${otherProps.id || otherProps.name || 'default'}`}
      ref={textFieldRef}
      placeholder={otherProps.placeholder}
      defaultValue={value}
      onChange={handleChange}
      {...otherProps}
    />
  );
});

StableTextfieldComponent.displayName = 'StableTextfieldComponent';

// Memoize component to prevent re-renders when value changes
// Only re-render when props that affect the input structure change
export const StableTextfield = React.memo(StableTextfieldComponent, (prevProps, nextProps) => {
  // Don't re-render when value changes - let the ref handle it
  // Only re-render when structural props change
  return (
    prevProps.stableKey === nextProps.stableKey &&
    prevProps.id === nextProps.id &&
    prevProps.name === nextProps.name &&
    prevProps.placeholder === nextProps.placeholder &&
    prevProps.isDisabled === nextProps.isDisabled &&
    prevProps.label === nextProps.label &&
    prevProps.onChange === nextProps.onChange
    // Intentionally NOT comparing value - let the ref sync handle it
  );
});

StableTextfield.displayName = 'StableTextfield';

