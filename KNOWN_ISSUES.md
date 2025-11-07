# Known Issues

## UI/Visual Issues

### Asymmetric Padding in Update Available Banner
**Location:** `src/embed-display.jsx` - EnhancedDiffView component wrapper
**Description:** The green "Update Available" SectionMessage has asymmetric padding - the right side padding is thinner than the left side.
**Status:** Investigating - SectionMessage component may have built-in asymmetric padding that we cannot override with Forge's xcss system.
**Workaround:** None currently - cosmetic issue only, does not affect functionality.
**Priority:** Low - cosmetic issue
**Date Added:** 2025-11-06
