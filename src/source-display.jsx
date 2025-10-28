import React, { Fragment, useEffect } from 'react';
import ForgeReconciler, { Text, useConfig, useProductContext, AdfRenderer } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const config = useConfig();
  const context = useProductContext();

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Auto-update excerpt content whenever macro body changes
  useEffect(() => {
    if (!config?.excerptId || !macroBody) {
      return;
    }

    const updateExcerptContent = async () => {
      try {
        await invoke('updateExcerptContent', {
          excerptId: config.excerptId,
          content: macroBody
        });
      } catch (error) {
        console.error('Error auto-updating excerpt content:', error);
      }
    };

    updateExcerptContent();
  }, [config?.excerptId, macroBody]);

  // If no configuration yet, show placeholder
  if (!config || !config.excerptName) {
    return (
      <Fragment>
        <Text>SmartExcerpt not configured. Click Edit to set up this excerpt.</Text>
      </Fragment>
    );
  }

  return (
    <Fragment>
      {macroBody && typeof macroBody === 'object' ? (
        <AdfRenderer document={macroBody} />
      ) : (
        <Text>{macroBody || 'No content yet. Edit the macro body to add content.'}</Text>
      )}
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
