# Bug: Toggle Markers Visible in Include Macro Published View

**Status:** Documented - To Fix After Phase 1 Testing
**Date Discovered:** 2025-10-30
**Discovered During:** Phase 1 refactoring testing
**Priority:** Medium

## Problem

When an Include macro has toggle content enabled, the raw toggle markers are visible in the published view:
- `{{toggle:advanced}}`
- `{{/toggle:advanced}}`

These markers should be stripped out during rendering, showing only the content between them.

## Expected Behavior

When toggle "advanced" is **enabled**:
```
Hello Quinn, welcome to SeatGeek!

This is advanced content with expert.

You can even write custom stuff here too.
```

## Actual Behavior

When toggle "advanced" is **enabled**:
```
Hello Quinn, welcome to SeatGeek!

{{toggle:advanced}}

This is advanced content with expert.

You can even write custom stuff here too.

{{/toggle:advanced}}
```

## Root Cause Analysis

**Pre-Existing Bug:** This issue existed BEFORE Phase 1 refactoring.
- Phase 1 only touched backend utilities in `index.js`
- No changes made to `include-display.jsx`
- Git history confirms zero commits modified Include display logic

**Code Investigation:**

The `filterContentByToggles` function exists at `src/include-display.jsx:176-213` and has correct logic:
```javascript
text = text.replace(toggleRegex, (match, toggleName, content) => {
  const trimmedName = toggleName.trim();
  // If toggle is enabled (true), keep content without markers
  return toggleStates?.[trimmedName] === true ? content : '';
});
```

**This function is called in 4 places:**
- Line 465: Optimistic rendering path
- Line 545: Fresh content loading path
- Line 691: Preview rendering
- Line 740: Update content path

**Hypothesis:** One of the rendering code paths is not properly applying `filterContentByToggles`, or the toggle markers are being re-inserted somewhere in the rendering pipeline.

## Steps to Reproduce

1. Create a Source macro with toggle content:
   ```
   Hello {{name}}, welcome to {{company}}!

   {{toggle:advanced}}
   This is advanced content with {{detail-level}}.
   {{/toggle:advanced}}
   ```

2. Create an Include macro on a different page
3. Enable the "advanced" toggle
4. Save the Include
5. View the published page

**Result:** Toggle markers are visible in output

## Test Environment

- Environment: qrsouther.atlassian.net (Development)
- Branch: `refactor/modularize-index-js`
- Forge CLI: Latest
- Test macro: "Test Phase 1"

## Impact

- **User Experience:** Medium - Markers are visible but don't break functionality
- **Visual Cleanliness:** Low - Content is still readable, just cluttered
- **Functionality:** None - Toggle enable/disable logic works correctly

## Next Steps

1. ✅ Complete Phase 1 testing (confirm refactoring didn't introduce regressions)
2. 🔧 Debug `filterContentByToggles` application in rendering pipeline
3. 🧪 Add test case for toggle marker removal
4. 🚀 Deploy fix to dev environment

## Related Code

- `src/include-display.jsx:174-213` - `filterContentByToggles` function
- `src/include-display.jsx:465` - Optimistic rendering path
- `src/include-display.jsx:545` - Fresh content loading path
- `src/include-display.jsx:691` - Preview rendering path
- `src/include-display.jsx:740` - Update content path

## Screenshots

See test screenshot showing markers visible: `{{toggle:advanced}}` and `{{/toggle:advanced}}`

---

**Note:** This bug is tracked separately from the Phase 1 refactoring work. Phase 1 did not cause this issue.
