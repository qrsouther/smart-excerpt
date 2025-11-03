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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // DISABLED: Staleness check was causing performance issues with dozens of macros
  // TODO: Re-implement with proper deduplication, debouncing, and React Query caching
  // useEffect(() => {
  //   if (!config?.excerptId || !macroBody || context?.extension?.isEditing) {
  //     return;
  //   }
  //   const checkAndUpdateContent = async () => {
  //     const result = await invoke('getExcerpt', { excerptId: config.excerptId });
  //     // ... comparison and update logic
  //   };
  //   checkAndUpdateContent();
  // }, [config?.excerptId, macroBody, context?.extension?.isEditing]);

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
