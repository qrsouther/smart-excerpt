/**
 * Create Test Page with 148 Embed Macros
 *
 * Creates a Confluence page with 148 Blueprint Standard - Embed macros,
 * each referencing one of the migrated Sources with random variable values.
 *
 * This is for performance testing to see how quickly a page loads with
 * 3x the realistic maximum number of Embeds.
 */

import api, { route } from '@forge/api';
import { storage } from '@forge/api';
import Resolver from '@forge/resolver';

const resolver = new Resolver();

// Random word generators for test data
const adjectives = ['Red', 'Blue', 'Fast', 'Slow', 'Big', 'Small', 'Hot', 'Cold', 'New', 'Old', 'Happy', 'Sad'];
const nouns = ['Cat', 'Dog', 'Car', 'Tree', 'House', 'Book', 'Phone', 'Table', 'Chair', 'Window'];
const dates = ['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05', '2024-05-25'];
const venues = ['Stadium Alpha', 'Arena Beta', 'Center Gamma', 'Park Delta'];

function randomWord() {
  const words = [...adjectives, ...nouns];
  return words[Math.floor(Math.random() * words.length)];
}

function randomTwoWords() {
  return `${randomWord()} ${randomWord()}`;
}

function randomDate() {
  return dates[Math.floor(Math.random() * dates.length)];
}

function randomVenue() {
  return venues[Math.floor(Math.random() * venues.length)];
}

function generateRandomValue(variableName) {
  // Try to generate contextually appropriate random values
  if (variableName.includes('date')) return randomDate();
  if (variableName.includes('venue')) return randomVenue();
  if (variableName.includes('league') || variableName.includes('vertical')) return randomWord();

  // Default: 1-2 random words
  return Math.random() > 0.5 ? randomWord() : randomTwoWords();
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

resolver.define('createTestEmbedsPage', async (req) => {
  try {
    console.log('🚀 Starting test page creation with 148 Embed macros...');

    // Get page ID and space key from request (with defaults)
    const targetPageId = req.payload?.pageId || '99909713'; // Default to your test page
    const spaceKey = req.payload?.spaceKey || '~5bb22d3a0958e968ce8153a3';

    // Step 1: Fetch all excerpts from storage
    console.log('📡 Fetching all excerpts from storage...');
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    console.log(`✓ Found ${excerptIndex.excerpts.length} excerpts`);

    if (excerptIndex.excerpts.length === 0) {
      throw new Error('No excerpts found in storage. Run bulk initialization first.');
    }

    // Step 2: Load full excerpt data for each (to get variables)
    console.log('📋 Loading full excerpt data...');
    const excerpts = [];
    for (const summary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${summary.id}`);
      if (excerpt) {
        excerpts.push(excerpt);
      }
    }
    console.log(`✓ Loaded ${excerpts.length} full excerpts`);

    // Step 3: Generate Embed macros
    console.log('🏗️ Generating 148 Embed macros...');
    const embedMacros = [];

    for (let i = 0; i < excerpts.length; i++) {
      const excerpt = excerpts[i];
      const localId = generateUUID();

      // Generate random variable values
      const variableValues = {};
      if (excerpt.variables && excerpt.variables.length > 0) {
        excerpt.variables.forEach(variable => {
          variableValues[variable.name] = generateRandomValue(variable.name);
        });
      }

      // Create the Embed macro in Confluence storage format
      const embedMacro = `<ac:adf-extension>
  <ac:adf-node type="extension">
    <ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>
    <ac:adf-attribute key="extension-key">blueprint-standard-embed</ac:adf-attribute>
    <ac:adf-attribute key="layout">default</ac:adf-attribute>
    <ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>
    <ac:adf-parameter key="excerpt-id">${excerpt.id}</ac:adf-parameter>
    <ac:adf-parameter key="__bodyContent">
      <guest-params>
        <parameter name="excerpt-id">${excerpt.id}</parameter>
        <parameter name="variable-values">${JSON.stringify(variableValues).replace(/"/g, '&quot;')}</parameter>
      </guest-params>
    </ac:adf-parameter>
  </ac:adf-node>
</ac:adf-extension>`;

      embedMacros.push(embedMacro);
      console.log(`  ✓ Created Embed ${i + 1}/${excerpts.length} for "${excerpt.name}"`);
    }

    console.log(`✓ Generated ${embedMacros.length} Embed macros`);

    // Step 4: Create page content
    console.log('📝 Assembling page content...');
    const pageContent = `<h1>Performance Test: 148 Blueprint Standard Embeds</h1>
<p>This page contains ${embedMacros.length} Embed macros for performance testing.</p>
<p>Created: ${new Date().toISOString()}</p>
<hr/>
${embedMacros.join('\n\n')}`;

    console.log(`✓ Page content assembled (${pageContent.length} characters)`);

    // Step 5: Fetch current page to get version
    console.log(`📡 Fetching page ${targetPageId}...`);
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${targetPageId}`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    console.log(`✓ Page fetched (version ${pageData.version.number})`);

    // Step 6: Update the page
    console.log('🚀 Updating page with Embed macros...');
    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${targetPageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: targetPageId,
          status: 'current',
          title: `🧪 Performance Test: ${embedMacros.length} Embeds`,
          spaceId: pageData.spaceId,
          body: {
            representation: 'storage',
            value: pageContent
          },
          version: {
            number: pageData.version.number + 1,
            message: `Added ${embedMacros.length} test Embed macros`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log('✓ Page updated successfully!');

    return {
      success: true,
      pageId: targetPageId,
      embedCount: embedMacros.length,
      pageUrl: `/wiki/spaces/${spaceKey}/pages/${targetPageId}`,
      message: `Successfully created test page with ${embedMacros.length} Embed macros!`
    };

  } catch (error) {
    console.error('❌ Error creating test page:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

export const handler = resolver.getDefinitions();
