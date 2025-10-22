import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Button,
  Textfield
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

const App = () => {
  const [excerpts, setExcerpts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usageData, setUsageData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  // Load excerpts and their usage data
  useEffect(() => {
    const loadExcerpts = async () => {
      try {
        console.log('Admin page: Starting to load excerpts...');
        const result = await invoke('getAllExcerpts');
        console.log('Admin page: Result received');

        if (result && result.success) {
          console.log('Admin page: Setting excerpts:', result.excerpts.length);

          // Sanitize excerpts to ensure no objects with {value, label} keys
          const sanitized = (result.excerpts || []).map(excerpt => {
            // Ensure variables is a proper array of objects
            const cleanVariables = Array.isArray(excerpt.variables)
              ? excerpt.variables.filter(v => v && typeof v === 'object' && v.name)
              : [];

            // Ensure toggles is a proper array of objects
            const cleanToggles = Array.isArray(excerpt.toggles)
              ? excerpt.toggles.filter(t => t && typeof t === 'object' && t.name)
              : [];

            return {
              ...excerpt,
              variables: cleanVariables,
              toggles: cleanToggles,
              category: String(excerpt.category || 'General'),
              updatedAt: excerpt.updatedAt ? String(excerpt.updatedAt) : null
            };
          });

          setExcerpts(sanitized);

          // Load usage data for each excerpt
          const usageMap = {};
          for (const excerpt of sanitized) {
            const usageResult = await invoke('getExcerptUsage', { excerptId: excerpt.id });
            if (usageResult && usageResult.success) {
              usageMap[excerpt.id] = usageResult.usage || [];
            }
          }
          setUsageData(usageMap);
        } else {
          console.error('Admin page: Failed to load');
          setError('Failed to load excerpts');
        }
      } catch (err) {
        console.error('Admin page: Exception:', err);
        setError(String(err.message || 'Unknown error'));
      } finally {
        console.log('Admin page: Setting loading to false');
        setIsLoading(false);
      }
    };

    loadExcerpts();
  }, []);

  const handleDelete = async (excerptId) => {
    if (!confirm('Delete this source? This cannot be undone.')) {
      return;
    }

    try {
      const result = await invoke('deleteExcerpt', { excerptId });
      if (result.success) {
        // Reload excerpts
        setExcerpts(excerpts.filter(e => e.id !== excerptId));
      } else {
        alert('Failed to delete: ' + result.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <Fragment>
        <Text><Strong>SmartExcerpt Manager</Strong></Text>
        <Text>Loading...</Text>
      </Fragment>
    );
  }

  if (error) {
    return (
      <Fragment>
        <Text><Strong>SmartExcerpt Manager</Strong></Text>
        <Text>Error: {error}</Text>
      </Fragment>
    );
  }

  // Filter excerpts based on search term
  const filteredExcerpts = excerpts.filter(excerpt =>
    excerpt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Fragment>
      <Text><Strong>SmartExcerpt Manager</Strong></Text>
      <Text>Found {excerpts.length} source(s)</Text>
      <Text>{' '}</Text>

      <Textfield
        placeholder="Search by name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <Text>{' '}</Text>

      {filteredExcerpts.length === 0 && searchTerm ? (
        <Text>No excerpts match "{searchTerm}"</Text>
      ) : !excerpts || excerpts.length === 0 ? (
        <Fragment>
          <Text>No SmartExcerpt Sources found.</Text>
          <Text>Create a SmartExcerpt Source macro on a page to get started.</Text>
        </Fragment>
      ) : (
        <Fragment>
          {filteredExcerpts.map((excerpt) => {
            const varCount = Array.isArray(excerpt.variables) ? excerpt.variables.length : 0;
            const toggleCount = Array.isArray(excerpt.toggles) ? excerpt.toggles.length : 0;
            const category = String(excerpt.category || 'General');
            const usage = usageData[excerpt.id] || [];
            const usageCount = Array.isArray(usage) ? usage.length : 0;

            return (
              <Fragment key={excerpt.id}>
                <Text><Strong>{excerpt.name}</Strong></Text>
                <Text>Category: {category}</Text>
                <Text>Variables: {varCount}, Toggles: {toggleCount}</Text>
                <Text>Used on {usageCount} page(s)</Text>
                {usageCount > 0 && (
                  <Fragment>
                    {usage.map((ref, idx) => (
                      <Text key={idx}>  - {String(ref.pageTitle || 'Unknown Page')}</Text>
                    ))}
                  </Fragment>
                )}
                {excerpt.sourcePageId && (
                  <Button
                    appearance="link"
                    onClick={async () => {
                      try {
                        await router.navigate(`/wiki/pages/viewpage.action?pageId=${excerpt.sourcePageId}`);
                      } catch (err) {
                        console.error('Navigation error:', err);
                      }
                    }}
                  >
                    View Source Page
                  </Button>
                )}
                <Button
                  appearance="danger"
                  onClick={() => handleDelete(excerpt.id)}
                >
                  Delete
                </Button>
                <Text>{' '}</Text>
              </Fragment>
            );
          })}
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
