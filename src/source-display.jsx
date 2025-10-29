import React, { Fragment, useEffect, useMemo } from 'react';
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

  // Capture macroBody on first render and NEVER update it (to prevent re-render loops)
  const [frozenMacroBody, setFrozenMacroBody] = React.useState(null);
  const hasInitialized = React.useRef(false);

  React.useEffect(() => {
    if (macroBody && !hasInitialized.current) {
      setFrozenMacroBody(macroBody);
      hasInitialized.current = true;
    }
  }, [macroBody]);

  // Check if body content has changed and update timestamp (runs in view mode after page save)
  useEffect(() => {
    if (!config?.excerptId || !macroBody || context?.extension?.isEditing) {
      return; // Skip in edit mode or if no content
    }

    const checkAndUpdateContent = async () => {
      try {
        // Get the stored excerpt to compare content
        const result = await invoke('getExcerpt', { excerptId: config.excerptId });
        if (!result.success || !result.excerpt) {
          return;
        }

        // Compare stored content with current macroBody
        const storedContentStr = JSON.stringify(result.excerpt.content);
        const currentContentStr = JSON.stringify(macroBody);

        if (storedContentStr !== currentContentStr) {
          console.log('📝 Detected body content change in view mode, updating excerpt...');
          // Content has changed - update it
          await invoke('updateExcerptContent', {
            excerptId: config.excerptId,
            content: macroBody
          });
          console.log('✅ Source content updated with new body, updatedAt refreshed');
        }
      } catch (error) {
        console.error('Error checking/updating content:', error);
      }
    };

    checkAndUpdateContent();
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
