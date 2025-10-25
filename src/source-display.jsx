import React, { Fragment, useEffect } from 'react';
import ForgeReconciler, { Text, useConfig, useProductContext, AdfRenderer } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  console.log('=== SOURCE DISPLAY V4.42 LOADED ===');

  const config = useConfig();
  const context = useProductContext();

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  console.log('Source display config:', config);
  console.log('Source display macroBody:', macroBody);

  // Auto-update excerpt content whenever macro body changes
  useEffect(() => {
    console.log('useEffect triggered - excerptId:', config?.excerptId, 'macroBody exists:', !!macroBody);

    if (!config?.excerptId) {
      console.log('Skipping update: no excerptId');
      return;
    }

    if (!macroBody) {
      console.log('Skipping update: no macroBody');
      return;
    }

    const updateExcerptContent = async () => {
      try {
        console.log('Auto-updating excerpt content for:', config.excerptId);
        console.log('Current macro body:', JSON.stringify(macroBody));
        await invoke('updateExcerptContent', {
          excerptId: config.excerptId,
          content: macroBody
        });
        console.log('Content update complete');
      } catch (error) {
        console.error('Error auto-updating excerpt content:', error);
      }
    };

    updateExcerptContent();
  }, [config?.excerptId, macroBody]);

  // If no configuration yet, show placeholder
  if (!config || !config.excerptName) {
    console.log('No excerptName in config, showing placeholder');
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
