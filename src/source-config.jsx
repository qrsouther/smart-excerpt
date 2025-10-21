import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
  Textfield,
  Select,
  Text,
  Button,
  useForm,
  useConfig,
  useProductContext
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const config = useConfig() || {};
  const context = useProductContext();
  const { handleSubmit, getFieldId } = useForm();
  const excerptId = config.excerptId || null;

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Use state for controlled components
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');

  console.log('Source config - config:', config);
  console.log('Source config - excerptName:', config.excerptName);
  console.log('Source config - category:', config.category);
  console.log('Source config - macroBody:', macroBody);

  // Update state when config changes
  useEffect(() => {
    console.log('useEffect - updating state from config', config);
    setExcerptName(config.excerptName || '');
    setCategory(config.category || 'General');
  }, [config.excerptName, config.category]);

  const categoryOptions = [
    { label: 'General', value: 'General' },
    { label: 'Pricing', value: 'Pricing' },
    { label: 'Technical', value: 'Technical' },
    { label: 'Legal', value: 'Legal' },
    { label: 'Marketing', value: 'Marketing' }
  ];

  const onSubmit = async (formData) => {
    console.log('=== FORM SUBMIT CALLED ===');
    console.log('Form data:', formData);
    console.log('State values:', { excerptName, category });
    console.log('Macro body (ADF):', macroBody);

    try {
      const result = await invoke('saveExcerpt', {
        excerptName,
        category,
        content: macroBody,  // Send the ADF body as content
        excerptId
      });

      console.log('Save result:', result);

      // Only submit the config fields (not the content, which is in the body)
      const configToSubmit = {
        excerptId: result.excerptId,
        excerptName: result.excerptName,
        category: result.category,
        variables: result.variables
        // NOTE: Do NOT include content in config - it's stored in the macro body
      };

      console.log('Submitting config to view:', { config: configToSubmit });

      // Save the configuration to the macro using view.submit()
      await view.submit({ config: configToSubmit });

      console.log('Configuration saved successfully - view.submit complete');
      console.log('⚠️ REMINDER: Publish the page to persist these changes!');
    } catch (error) {
      console.error('Save error:', error);
      throw error;
    }
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <FormSection>
        <Label labelFor={getFieldId('excerptName')}>
          Excerpt Name
        </Label>
        <Textfield
          id={getFieldId('excerptName')}
          value={excerptName}
          onChange={(e) => setExcerptName(e.target.value)}
        />

        <Label labelFor={getFieldId('category')}>
          Category
        </Label>
        <Select
          id={getFieldId('category')}
          options={categoryOptions}
          value={categoryOptions.find(opt => opt.value === category)}
          onChange={(e) => setCategory(e.value)}
        />

        {excerptId && (
          <Text>Excerpt ID: {excerptId}</Text>
        )}

        <Text>{'💡 Tip: Edit the macro body in the page editor to add rich text content. Use double curly braces like {{variable}} to create variables.'}</Text>
        <Text>📝 Content is edited directly in the Confluence editor (not in this panel).</Text>
        <Text>{'⚠️ IMPORTANT: After clicking "Save SmartExcerpt", you MUST publish the page to persist Name/Category changes!'}</Text>
      </FormSection>

      <FormFooter>
        <Button appearance="primary" type="submit">
          Save SmartExcerpt
        </Button>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
