/**
 * MultiExcerpt to SmartExcerpt Migration Content Script
 *
 * This script runs directly on the Confluence edit page in the user's authenticated session.
 * It migrates MultiExcerpt Source macros to SmartExcerpt Source macros by:
 * 1. Finding all MultiExcerpt macros
 * 2. Copying their content
 * 3. Creating new SmartExcerpt macros via slash command
 * 4. Pasting the content
 * 5. Deleting the old MultiExcerpt macros
 */

(async function() {
  console.log('🚀 SmartExcerpt Migration Script Starting...');

  // Helper function to wait
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Send progress updates to the extension popup
  function sendProgress(data) {
    chrome.runtime.sendMessage({ type: 'MIGRATION_PROGRESS', ...data });
  }

  // Find all Multi Excerpt macros in the editor
  function findMultiExcerptMacros() {
    const containers = document.querySelectorAll('[data-testid="extension-container"]');
    const macros = [];

    containers.forEach((container, index) => {
      const contentWrapper = container.querySelector('.bodiedExtension-content-dom-wrapper');
      if (contentWrapper) {
        macros.push({
          index,
          container,
          contentWrapper,
          textPreview: contentWrapper.textContent.substring(0, 100)
        });
      }
    });

    return macros;
  }

  // Step 1: Copy content from MultiExcerpt macro
  function copyMacroContent(contentWrapper) {
    try {
      const range = document.createRange();
      range.selectNodeContents(contentWrapper);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
      return { success: true, length: contentWrapper.textContent.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Step 2: Position cursor after the macro and insert slash command
  async function positionCursorAndInsertCommand(container) {
    try {
      // Find the ProseMirror editor view
      const editorElement = document.querySelector('.ak-editor-content-area, [data-testid="fabric-editor-container"]');

      if (!editorElement) {
        return { success: false, error: 'Could not find editor element' };
      }

      // Scroll the container into view
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);

      // Get position after the container
      const rect = container.getBoundingClientRect();
      const x = rect.left + 50;
      const y = rect.bottom + 20;

      // Create and dispatch a real mouse click event
      const mouseDownEvent = new MouseEvent('mousedown', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0
      });

      const mouseUpEvent = new MouseEvent('mouseup', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0
      });

      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0
      });

      // Get the element at that position
      const targetElement = document.elementFromPoint(x, y);

      if (targetElement) {
        targetElement.dispatchEvent(mouseDownEvent);
        await sleep(50);
        targetElement.dispatchEvent(mouseUpEvent);
        await sleep(50);
        targetElement.dispatchEvent(clickEvent);
        await sleep(500);
      }

      // Now try to insert the slash command using clipboard
      // Copy the command to clipboard
      await navigator.clipboard.writeText('/smartexcerpt');
      await sleep(100);

      // Try to paste it using execCommand
      let inserted = document.execCommand('paste');

      if (!inserted) {
        // Try to focus and paste
        const contentEditable = document.querySelector('[contenteditable="true"]');
        if (contentEditable) {
          contentEditable.focus();
          await sleep(100);

          // Try paste via execCommand
          inserted = document.execCommand('paste');

          if (!inserted) {
            // Try simulating Ctrl+V / Cmd+V
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData.setData('text/plain', '/smartexcerpt');
            contentEditable.dispatchEvent(pasteEvent);
            inserted = true;
          }
        }
      }

      await sleep(1000);
      return { success: true, inserted };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Main migration function for a single macro
  async function migrateSingleMacro(macro, macroIndex, totalMacros, macroName) {
    sendProgress({
      status: 'processing',
      current: macroIndex + 1,
      total: totalMacros,
      macroName,
      message: `Processing macro ${macroIndex + 1} of ${totalMacros}: "${macroName}"`
    });

    try {
      // Step 1: Copy content
      const copyResult = copyMacroContent(macro.contentWrapper);
      if (!copyResult.success) {
        throw new Error(`Failed to copy content: ${copyResult.error}`);
      }

      sendProgress({
        status: 'processing',
        current: macroIndex + 1,
        total: totalMacros,
        macroName,
        message: `✓ Copied ${copyResult.length} characters`
      });

      await sleep(500);

      // Step 2 & 3: Position cursor and insert slash command
      const insertResult = await positionCursorAndInsertCommand(macro.container);
      if (!insertResult.success) {
        throw new Error(`Failed to insert command: ${insertResult.error}`);
      }

      sendProgress({
        status: 'processing',
        current: macroIndex + 1,
        total: totalMacros,
        macroName,
        message: `✓ Inserted slash command${insertResult.inserted ? ' successfully' : ' (may need verification)'}`
      });

      // Wait for slash menu to appear
      await sleep(2000);

      // TODO: Steps 4-6 will be implemented after testing
      // Step 4: Select SmartExcerpt from menu
      // Step 5: Fill in config modal (name, category)
      // Step 6: Paste content and delete old macro

      return {
        success: true,
        macroName,
        partial: true // Indicates steps 4-6 not yet implemented
      };

    } catch (err) {
      return {
        success: false,
        macroName,
        error: err.message
      };
    }
  }

  // Main execution
  try {
    // Find all macros
    const macros = findMultiExcerptMacros();

    sendProgress({
      status: 'started',
      total: macros.length,
      message: `Found ${macros.length} MultiExcerpt macros`
    });

    if (macros.length === 0) {
      sendProgress({
        status: 'complete',
        message: 'No MultiExcerpt macros found on this page'
      });
      return;
    }

    // Process only the first macro for testing
    const testMacro = macros[0];
    const result = await migrateSingleMacro(testMacro, 0, 1, 'Test Macro');

    if (result.success) {
      sendProgress({
        status: 'paused',
        message: 'Test successful! Check the browser to verify the slash command appeared.',
        details: 'Steps 4-6 not yet implemented. Ready to implement next.'
      });
    } else {
      sendProgress({
        status: 'error',
        message: `Migration failed: ${result.error}`
      });
    }

  } catch (err) {
    sendProgress({
      status: 'error',
      message: `Fatal error: ${err.message}`
    });
    console.error('Migration error:', err);
  }
})();
