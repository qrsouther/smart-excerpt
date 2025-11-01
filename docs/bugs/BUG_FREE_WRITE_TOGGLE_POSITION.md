# Bug: Free Write Paragraph Insertion Position with Enabled Toggles

**Status:** Documented - To Fix
**Date Discovered:** 2025-10-30
**Discovered During:** Phase 2 refactoring testing
**Priority:** Medium

## Problem

When a toggle is enabled and the user attempts to insert a Free Write paragraph at the END of that toggle's text content, the custom paragraph is incorrectly appended to the END of the entire Include macro content instead of being inserted at the position the user selected (which should be directly after the toggle content).

## Expected Behavior

If a Source macro has this content:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
{{/toggle:advanced}}

Paragraph 3: Final paragraph
```

And the user selects "After paragraph 2" in the Free Write tab dropdown and adds custom text "My custom insertion", the result should be:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
My custom insertion
{{/toggle:advanced}}

Paragraph 3: Final paragraph
```

## Actual Behavior

The custom paragraph gets inserted at the very end:
```
Paragraph 1: Hello world

{{toggle:advanced}}
Paragraph 2: This is advanced content
{{/toggle:advanced}}

Paragraph 3: Final paragraph

My custom insertion
```

## Root Cause Analysis

**Likely cause:** The paragraph extraction logic in `extractParagraphsFromAdf()` (src/include-display.jsx:483-536) may not be correctly handling paragraphs that are inside toggle blocks when the toggle is enabled.

When toggles are filtered/processed by `filterContentByToggles()`, the paragraph index mapping used by the Free Write insertion logic may become misaligned with the actual rendered content structure.

**Relevant Code:**
- `src/include-display.jsx:483-536` - `extractParagraphsFromAdf()` function
- `src/include-display.jsx:440-479` - `insertCustomParagraphsInAdf()` function
- `src/include-display.jsx:173-325` - `filterContentByToggles()` function

**Hypothesis:** The Free Write logic extracts paragraph indices AFTER toggle filtering, but toggle filtering changes the document structure, causing paragraph position calculations to be incorrect for content that was inside toggle blocks.

## Steps to Reproduce

1. Create a Source macro with toggle content:
   ```
   Hello world

   {{toggle:advanced}}
   This is advanced content
   {{/toggle:advanced}}

   Final paragraph
   ```

2. Create an Include macro referencing that Source
3. Open the Include in Edit mode
4. Go to the Alternatives tab and enable the "advanced" toggle
5. Go to the Free Write tab
6. Select "After paragraph 2: This is advanced content" from the dropdown
7. Enter custom text: "My custom insertion"
8. Click "Add Custom Paragraph"
9. Observe the Preview

**Result:** Custom paragraph appears at the end of the entire content, not after paragraph 2

## Impact

- **User Experience:** Medium - Users can still add custom paragraphs, but position is incorrect
- **Functionality:** Medium - Feature works but produces unexpected results
- **Workaround:** Users can manually edit content or insert at different positions

## Next Steps

1. 🔍 Debug `extractParagraphsFromAdf()` to understand how it counts paragraphs within toggle blocks
2. 🔧 Fix paragraph index calculation to account for toggle filtering
3. 🧪 Add test case for Free Write insertion with enabled toggles
4. 🚀 Deploy fix to dev environment

## Related Code

- `src/include-display.jsx:483-536` - `extractParagraphsFromAdf()` function
- `src/include-display.jsx:440-479` - `insertCustomParagraphsInAdf()` function
- `src/include-display.jsx:173-325` - `filterContentByToggles()` function
- `src/include-display.jsx:1207-1288` - Free Write tab UI

---

**Note:** This bug is separate from the toggle marker visibility issue (fixed in v6.31). This is a paragraph positioning calculation issue in the Free Write feature.
