import React, { Fragment, useEffect, useMemo, useRef } from 'react';
import ForgeReconciler, { Text, useConfig, useProductContext, AdfRenderer } from '@forge/react';
import { invoke } from '@forge/bridge';

// Memoized AdfRenderer to prevent re-renders
const MemoizedAdfRenderer = React.memo(({ document }) => {
  return <AdfRenderer document={document} />;
});

const App = () => {
  const config = useConfig();
  const context = useProductContext();

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Capture macroBody on first render and NEVER update it (to prevent re-render loops in view mode)
  const [frozenMacroBody, setFrozenMacroBody] = React.useState(null);
  const hasInitialized = useRef(false);

  // Track last content hash to detect actual changes
  const lastContentHashRef = useRef(null);
  // Track if update is in progress to prevent duplicates
  const updateInProgressRef = useRef(false);

  React.useEffect(() => {
    if (macroBody && !hasInitialized.current) {
      setFrozenMacroBody(macroBody);
      hasInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Re-enabled body change detection with proper safeguards for staleness tracking
  // This updates the excerpt timestamp when body content changes (after page publish/save)
  useEffect(() => {
    // Don't check during editing or if config not ready
    if (!config?.excerptId || !macroBody || context?.extension?.isEditing || updateInProgressRef.current) {
      return;
    }

    const checkAndUpdateContent = async () => {
      try {
        // Calculate content hash to detect actual changes (not just re-renders)
        const contentStr = JSON.stringify(macroBody);
        const currentHash = contentStr.length + '-' + contentStr.slice(0, 50); // Simple hash

        // Skip if content hasn't changed
        if (lastContentHashRef.current === currentHash) {
          return;
        }

        // Mark update in progress to prevent duplicates
        updateInProgressRef.current = true;

        // Call updateExcerptContent to update timestamp if content changed
        const result = await invoke('updateExcerptContent', {
          excerptId: config.excerptId,
          content: macroBody
        });

        if (result.success) {
          // Update our hash tracker
          lastContentHashRef.current = currentHash;
          // Only log when actual update happened (not when hash matched in backend)
          if (!result.unchanged) {
            console.log('[Source] Updated:', config.excerptName);
          }
        } else {
          console.error('[Source] Update failed:', result.error);
        }
      } catch (err) {
        console.error('[Source] Error:', err);
      } finally {
        updateInProgressRef.current = false;
      }
    };

    // Debounce: wait 1 second after content settles before checking
    const timeoutId = setTimeout(checkAndUpdateContent, 1000);
    return () => clearTimeout(timeoutId);
  }, [config?.excerptId, macroBody, context?.extension?.isEditing]);

  // If no configuration yet, show placeholder
  if (!config || !config.excerptName) {
    return (
      <Fragment>
        <Text>SmartExcerpt not configured. Click Edit to set up this excerpt.</Text>
      </Fragment>
    );
  }

  // Use frozen body to prevent re-renders with normalized ADF
  const bodyToRender = frozenMacroBody || macroBody;

  // Show loading until we have content
  if (!bodyToRender) {
    return <Text>Loading...</Text>;
  }

  return (
    <Fragment>
      {typeof bodyToRender === 'object' ? (
        <MemoizedAdfRenderer document={bodyToRender} />
      ) : (
        <Text>{bodyToRender || 'No content yet. Edit the macro body to add content.'}</Text>
      )}
    </Fragment>
  );
};

ForgeReconciler.render(<App />);
