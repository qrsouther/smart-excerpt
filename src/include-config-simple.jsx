import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
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
  const [excerpts, setExcerpts] = useState([]);
  const [selectedExcerptId, setSelectedExcerptId] = useState(config.excerptId || '');
  const [isLoading, setIsLoading] = useState(true);

  console.log('Include config - current config:', config);
  console.log('Include config - context:', context);

  // Update selectedExcerptId when config loads
  useEffect(() => {
    if (config.excerptId) {
      console.log('Config loaded, setting excerptId to:', config.excerptId);
      setSelectedExcerptId(config.excerptId);
    }
  }, [config.excerptId]);

  // Load excerpts on mount
  useEffect(() => {
    const loadExcerpts = async () => {
      console.log('Loading excerpts...');
      const result = await invoke('getExcerpts');
      console.log('Excerpts loaded:', result);

      if (result.success) {
        setExcerpts(result.excerpts);
        setIsLoading(false);
      }
    };

    loadExcerpts();
  }, []);

  const onSubmit = async (formData) => {
    console.log('=== INCLUDE CONFIG SUBMIT ===');
    console.log('Selected excerpt ID:', selectedExcerptId);

    if (!selectedExcerptId) {
      alert('Please select an excerpt');
      return;
    }

    // Get the selected excerpt to retrieve its name
    const selectedExcerpt = excerpts.find(e => e.id === selectedExcerptId);

    const configToSave = {
      excerptId: selectedExcerptId,
      excerptName: selectedExcerpt?.name,
      // Variable values will be set in the edit view
      variableValues: config.variableValues || {}
    };

    console.log('Saving config:', configToSave);

    try {
      // If the excerptId changed, remove the old usage tracking
      if (config.excerptId && config.excerptId !== selectedExcerptId && context?.localId) {
        console.log('Removing old usage tracking for:', config.excerptId);
        await invoke('removeExcerptUsage', {
          excerptId: config.excerptId,
          localId: context.localId
        });
      }

      // Track usage of the new excerptId
      // Backend will extract page context from req.context since frontend doesn't have access
      if (context?.localId && selectedExcerptId) {
        console.log('=== TRACK USAGE FRONTEND ===');
        console.log('Calling trackExcerptUsage with:', {
          excerptId: selectedExcerptId,
          localId: context.localId
        });
        const trackResult = await invoke('trackExcerptUsage', {
          excerptId: selectedExcerptId,
          localId: context.localId
        });
        console.log('✅ Usage tracking result:', trackResult);
      } else {
        console.warn('❌ Usage tracking SKIPPED - missing context:', {
          hasLocalId: !!context?.localId,
          hasExcerptId: !!selectedExcerptId
        });
      }

      await view.submit({ config: configToSave });
      console.log('Include configuration saved successfully');
    } catch (error) {
      console.error('Error saving include config:', error);
    }
  };

  if (isLoading) {
    return <Text>Loading excerpts...</Text>;
  }

  // Build excerpt options
  const excerptOptions = [{ label: '-- Select an excerpt --', value: '' }];
  const categorizedExcerpts = {};

  excerpts.forEach(excerpt => {
    const category = excerpt.category || 'General';
    if (!categorizedExcerpts[category]) {
      categorizedExcerpts[category] = [];
    }
    categorizedExcerpts[category].push(excerpt);
  });

  Object.keys(categorizedExcerpts).sort().forEach(category => {
    categorizedExcerpts[category].forEach(excerpt => {
      excerptOptions.push({
        label: `[${category}] ${excerpt.name}`,
        value: excerpt.id
      });
    });
  });

  const selectedOption = selectedExcerptId
    ? excerptOptions.find(opt => opt.value === selectedExcerptId)
    : excerptOptions[0];  // Default to first option if nothing selected

  console.log('Selected excerpt ID:', selectedExcerptId);
  console.log('Selected option:', selectedOption);

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <FormSection>
        <Label labelFor={getFieldId('excerptSelect')}>
          Select Source Excerpt
        </Label>
        <Select
          id={getFieldId('excerptSelect')}
          options={excerptOptions}
          value={selectedOption}
          onChange={(e) => {
            console.log('Select onChange:', e);
            setSelectedExcerptId(e?.value || '');
          }}
        />

        <Text>💡 After saving, edit the page to fill in variable values and toggle settings.</Text>
      </FormSection>

      <FormFooter>
        <Button appearance="primary" type="submit">
          Save Source Selection
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
