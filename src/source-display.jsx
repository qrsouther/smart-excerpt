import React, { Fragment } from 'react';
import ForgeReconciler, { Text, Strong, Em, Lozenge, useConfig, useProductContext, AdfRenderer } from '@forge/react';

const App = () => {
  const config = useConfig();
  const context = useProductContext();

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  console.log('Source display config:', config);
  console.log('Source display macroBody:', macroBody);

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
