/**
 * POC: Native Content Injection - Include Macro
 *
 * This is a proof-of-concept to test injecting content directly into
 * the Confluence page body instead of rendering in an iframe.
 *
 * In this POC:
 * - Shows simple UI with button to trigger injection
 * - On click: Backend injects content into page via REST API
 * - Result: Content appears as native Confluence content
 */

import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Button,
  Textfield,
  Box,
  Stack,
  SectionMessage,
  Spinner,
  xcss
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

const containerStyle = xcss({
  padding: 'space.200'
});

const App = () => {
  const [context, setContext] = useState(null);
  const [contentInput, setContentInput] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRefreshButton, setShowRefreshButton] = useState(false);

  useEffect(() => {
    view.getContext().then(ctx => {
      console.log('[POC] Context:', ctx);
      setContext(ctx);
    });
  }, []);

  // Extract IDs from context
  const pageId = context?.extension?.content?.id;
  const localId = context?.localId;

  const handleInject = async () => {
    if (!pageId || !localId) {
      setStatus('Error: Missing page ID or macro ID');
      return;
    }

    setIsLoading(true);
    setStatus('Injecting content into page...');
    setShowRefreshButton(false);

    try {
      const result = await invoke('injectContentPOC', {
        pageId,
        macroId: localId,
        localId,
        content: contentInput || 'Default Hello World content'
      });

      if (result.success) {
        setStatus(`✅ Success! Content injected. Click "Refresh Page" below to see the injected content.`);
        setShowRefreshButton(true);
      } else {
        setStatus(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Fragment>
      <Box xcss={containerStyle}>
        <Text>
          🔄 <Strong>SmartExcerpt POC Placeholder</Strong> - Content will be injected when you publish this page
        </Text>
      </Box>
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
