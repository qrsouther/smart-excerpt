const { invoke, view, requestResize } = require('@forge/bridge');

let excerpts = [];
let selectedExcerpt = null;
let variableValues = {};

// Initialize
function initializeApp() {
    console.log('Initializing SmartExcerpt Include');

    // Request initial resize
    requestResize('100%');

    // Load all excerpts
    loadExcerpts();

    // Load existing config (if editing existing include)
    view.getContext().then(context => {
        console.log('Context loaded:', context);
        const config = context.extension?.config || {};

        if (config.excerptId) {
            // Pre-select the excerpt and load its variables
            setTimeout(() => {
                document.getElementById('excerptSelect').value = config.excerptId;
                onExcerptSelected();

                // Fill in saved variable values
                if (config.variableValues) {
                    variableValues = config.variableValues;
                    populateVariableValues();
                }
            }, 500); // Wait for excerpts to load
        }
    }).catch(error => {
        console.error('Error loading context:', error);
    });

    // Attach excerpt selection handler
    document.getElementById('excerptSelect').addEventListener('change', onExcerptSelected);
}

async function loadExcerpts() {
    try {
        console.log('Loading excerpts...');
        const result = await invoke('handler', {
            action: 'getExcerpts'
        });

        console.log('Excerpts loaded:', result);

        if (result.success && result.excerpts) {
            excerpts = result.excerpts;
            populateExcerptSelect();
        } else {
            showError('Failed to load excerpts: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading excerpts:', error);
        showError('Failed to load excerpts: ' + error.message);
    }
}

function populateExcerptSelect() {
    const select = document.getElementById('excerptSelect');

    // Clear existing options (except the first one)
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Add excerpt options grouped by category
    const categories = {};
    excerpts.forEach(excerpt => {
        const category = excerpt.category || 'General';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(excerpt);
    });

    Object.keys(categories).sort().forEach(category => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = category;

        categories[category].forEach(excerpt => {
            const option = document.createElement('option');
            option.value = excerpt.id;
            option.textContent = excerpt.name;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);
    });
}

async function onExcerptSelected() {
    const excerptId = document.getElementById('excerptSelect').value;

    if (!excerptId) {
        document.getElementById('variableInputs').classList.remove('visible');
        document.getElementById('renderedContent').classList.remove('visible');
        document.getElementById('excerptInfo').textContent = '';
        return;
    }

    try {
        console.log('Loading excerpt:', excerptId);
        const result = await invoke('handler', {
            action: 'getExcerpt',
            excerptId: excerptId
        });

        console.log('Excerpt loaded:', result);

        if (result.success && result.excerpt) {
            selectedExcerpt = result.excerpt;
            displayExcerptInfo();
            setupVariableInputs();
            renderContent();
        } else {
            showError('Failed to load excerpt: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading excerpt:', error);
        showError('Failed to load excerpt: ' + error.message);
    }
}

function displayExcerptInfo() {
    const info = document.getElementById('excerptInfo');
    if (selectedExcerpt.variables && selectedExcerpt.variables.length > 0) {
        info.textContent = `This excerpt has ${selectedExcerpt.variables.length} variable(s): ${selectedExcerpt.variables.map(v => v.name).join(', ')}`;
    } else {
        info.textContent = 'This excerpt has no variables';
    }
}

function setupVariableInputs() {
    const container = document.getElementById('variableFields');
    const variableInputsDiv = document.getElementById('variableInputs');

    container.innerHTML = '';
    variableValues = {};

    if (!selectedExcerpt.variables || selectedExcerpt.variables.length === 0) {
        variableInputsDiv.classList.remove('visible');
        requestResize('100%');
        return;
    }

    variableInputsDiv.classList.add('visible');

    selectedExcerpt.variables.forEach(variable => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = variable.name;
        label.htmlFor = `var_${variable.name}`;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `var_${variable.name}`;
        input.placeholder = `Enter value for ${variable.name}`;
        input.dataset.varName = variable.name;

        // Add event listener for real-time rendering
        input.addEventListener('input', () => {
            variableValues[variable.name] = input.value;
            renderContent();
        });

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        container.appendChild(formGroup);
    });

    // Request resize after adding inputs
    setTimeout(() => requestResize('100%'), 100);
}

function populateVariableValues() {
    Object.keys(variableValues).forEach(varName => {
        const input = document.getElementById(`var_${varName}`);
        if (input) {
            input.value = variableValues[varName];
        }
    });
    renderContent();
}

function renderContent() {
    if (!selectedExcerpt) {
        return;
    }

    const contentDiv = document.getElementById('renderedContent');
    let content = selectedExcerpt.content;

    // Substitute variables
    if (selectedExcerpt.variables) {
        selectedExcerpt.variables.forEach(variable => {
            const value = variableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            content = content.replace(regex, value);
        });
    }

    contentDiv.textContent = content;
    contentDiv.classList.add('visible');

    // Request resize after rendering content
    setTimeout(() => requestResize('100%'), 100);

    // Save config for persistence
    saveConfig();
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function saveConfig() {
    if (!selectedExcerpt) {
        return;
    }

    try {
        // Note: In display mode, we don't use view.submit()
        // We just need to persist the current state
        console.log('Config to save:', {
            excerptId: selectedExcerpt.id,
            excerptName: selectedExcerpt.name,
            variableValues: variableValues
        });
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Wait for DOM to be ready, then initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
