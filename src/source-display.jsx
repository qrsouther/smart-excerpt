import React, { Fragment } from 'react';
import ForgeReconciler, { Text, Strong, Em, useConfig, useProductContext, AdfRenderer } from '@forge/react';

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

  // Show the excerpt info in read view
  const variablesText = config.variables && config.variables.length > 0
    ? config.variables.map(v => `{{${v.name}}}`).join(', ')
    : '';

  return (
    <Fragment>
      <Text>
        <Strong>SmartExcerpt: {config.excerptName}</Strong>
      </Text>
      <Text>Category: {config.category || 'General'}</Text>
      <Text>ID: {config.excerptId}</Text>
      <Text>---</Text>
      {macroBody && typeof macroBody === 'object' ? (
        <AdfRenderer document={macroBody} />
      ) : (
        <Text>{macroBody || 'No content yet. Edit the macro body to add content.'}</Text>
      )}
      {variablesText && (
        <Fragment>
          <Text>---</Text>
          <Text>
            <Em>Variables: {variablesText}</Em>
          </Text>
        </Fragment>
      )}
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
