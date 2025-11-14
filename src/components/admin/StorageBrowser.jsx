/**
 * Storage Browser Component
 *
 * Debugging tool for querying Forge storage directly by key.
 * Useful for inspecting Embed configs, excerpts, usage data, etc.
 *
 * Usage:
 * - Enter a storage key (e.g., macro-vars:{uuid}, excerpt:{id}, usage:{id})
 * - Click Query to fetch the data
 * - View formatted JSON output
 *
 * Common key patterns:
 * - macro-vars:{localId} - Embed instance configuration
 * - excerpt:{id} - Source/Blueprint Standard definition
 * - usage:{excerptId} - Usage tracking data
 * - excerpt-index - Master index of all excerpts
 */

import React, { useState } from 'react';
import {
  Box,
  Stack,
  Inline,
  Heading,
  Text,
  CodeBlock,
  Textfield,
  Button,
  Select,
  xcss,
  Strong
} from '@forge/react';
import { invoke } from '@forge/bridge';

const containerStyles = xcss({
  padding: 'space.200',
  backgroundColor: 'color.background.neutral',
  borderRadius: 'border.radius',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  width: '100%'
});

const codeBlockContainerStyles = xcss({
  maxHeight: '600px',
  overflowY: 'auto',
  paddingRight: 'space.200',
  marginRight: 'space.100'
});

const selectStyles = xcss({
  minWidth: '200px'
});

export function StorageBrowser() {
  const [keyType, setKeyType] = useState({ label: 'Embed Config', value: 'macro-vars' });
  const [keyValue, setKeyValue] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [result, setResult] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const keyTypeOptions = [
    { label: 'Embed UUID', value: 'macro-vars' },
    { label: 'Source UUID', value: 'excerpt' },
    { label: 'Usage Tracking UUID', value: 'usage' },
    { label: 'Master Index', value: 'excerpt-index' }
  ];

  const handleCopyJson = async (jsonData) => {
    if (!jsonData) return;

    // Focus the window first to satisfy Clipboard API requirements
    try {
      window.focus();
    } catch (e) {
      // Focus failed, continue anyway
    }

    const jsonString = JSON.stringify(jsonData, null, 2);

    try {
      await navigator.clipboard.writeText(jsonString);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      // Fallback to legacy method if Clipboard API fails
      try {
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        }
      } catch (fallbackError) {
        // Both methods failed, silently fail
      }
    }
  };

  const handleQuery = async () => {
    // Build the full storage key
    let fullKey;
    if (keyType.value === 'excerpt-index') {
      // Master index doesn't need a suffix
      fullKey = 'excerpt-index';
    } else {
      // Other types need the value appended with colon
      if (!keyValue.trim()) {
        setResult({ error: 'Please enter a key value' });
        return;
      }
      fullKey = `${keyType.value}:${keyValue.trim()}`;
    }

    setIsQuerying(true);
    setResult(null);

    try {
      const response = await invoke('queryStorage', { key: fullKey });
      setResult(response);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setIsQuerying(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.error) {
      return (
        <Box backgroundColor="color.background.danger" padding="space.200">
          <Text color="color.text.danger">Error: {result.error}</Text>
        </Box>
      );
    }

    if (!result.exists) {
      return (
        <Box backgroundColor="color.background.warning" padding="space.200">
          <Text color="color.text.warning">
            <Strong>Not Found:</Strong> {result.message}
          </Text>
        </Box>
      );
    }

    // Pretty format the JSON with proper indentation
    const formattedJson = JSON.stringify(result.data, null, 2);

    return (
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Text size="small" weight="medium">
            ✅ Found • Type: {result.dataType} • Size: {result.dataSize} bytes
          </Text>
          <Button
            appearance="subtle"
            onClick={() => handleCopyJson(result.data)}
          >
            {copySuccess ? '✓ Copied!' : '📋 Copy Full JSON'}
          </Button>
        </Inline>
        <Box xcss={codeBlockContainerStyles}>
          <CodeBlock
            language="json"
            text={formattedJson}
            showLineNumbers={true}
            shouldWrapLongLines={true}
          />
        </Box>
      </Stack>
    );
  };

  return (
    <Box xcss={containerStyles}>
      <Stack space="space.200">
        <Heading size="medium">💾 Storage Browser</Heading>

        <Text size="small" color="color.text.subtlest">
          Select the key type and paste the UUID. Use the Copy button from Embed edit view for Embed Config queries.
        </Text>

        <Inline space="space.100" alignBlock="center">
          <Box xcss={selectStyles}>
            <Select
              options={keyTypeOptions}
              value={keyType}
              onChange={(selected) => setKeyType(selected)}
            />
          </Box>
          <Textfield
            placeholder={keyType.value === 'excerpt-index' ? 'No value needed for Master Index' : 'Paste UUID here...'}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            isDisabled={keyType.value === 'excerpt-index'}
            width="large"
          />
          <Button
            appearance="primary"
            onClick={handleQuery}
            isDisabled={isQuerying || (keyType.value !== 'excerpt-index' && !keyValue.trim())}
          >
            {isQuerying ? 'Querying...' : 'Query'}
          </Button>
        </Inline>

        {renderResult()}
      </Stack>
    </Box>
  );
}
