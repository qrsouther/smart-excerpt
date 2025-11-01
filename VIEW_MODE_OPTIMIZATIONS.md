# View Mode Performance Optimization Menu

## Current Performance Baseline

**View mode loading time:** 120-170ms per Include macro

**Breakdown:**
- React mount + config read: 5ms
- `invoke('getCachedContent')` network call: 100-150ms (85% of time)
- React render: 10ms

**Bottleneck:** Network latency on cached content fetch

---

## Optimization Options

### Quick Wins (Implement First)

#### 1. Skeleton Loading
**Current:** Blank screen for 150ms
**Better:** Show animated placeholder immediately

**Implementation:**
```javascript
if (!content && !isEditing) {
  return (
    <Stack space="space.100">
      <SkeletonItem />
      <SkeletonItem />
      <SkeletonItem />
    </Stack>
  );
}
```

**Gain:** Feels 2x faster (perceived improvement)
**Actual speed:** 0ms (same load time, better UX)
**Time to implement:** 20 minutes
**Risk:** None

---

#### 2. Batch Loading Multiple Instances
**Current:** Each macro makes separate network call
**Problem:** Page with 50 macros = 50 × 150ms = 7,500ms (7.5 seconds!)
**Better:** One batched call for all macros on page

**Implementation:**
- Backend resolver: `getCachedContentBatch({localIds: [...]})`
- Frontend coordinator: Collect all localIds, make one call, distribute results
- Progressive rendering: Show results as they arrive

**Gain:**
- 5 macros: 750ms → 150ms (5x faster)
- 50 macros: 7,500ms → 150ms (50x faster)
- **This is the biggest win for Blueprint pages with 40-80 includes**

**Time to implement:** 3-4 hours
**Risk:** Requires backend + frontend coordination

---

### Medium-Effort Optimizations

#### 3. Config-Based Caching (Eliminate Network Call)
**Current:** Rendered content stored in backend (`macro-cache:${localId}`)
**Better:** Store rendered content directly in macro's config object

**Flow:**
- Edit mode: Save rendered content to config (in addition to backend)
- View mode: Read from `useConfig()` - synchronous, 0ms!
- Background: Check for staleness

**Implementation:**
```javascript
const config = useConfig();
const cachedContent = config.cachedContent; // Already available!

if (cachedContent) {
  setContent(cachedContent); // Instant render
}

// Background staleness check
useEffect(() => {
  checkIfStale().then(isStale => {
    if (isStale) showUpdateBanner();
  });
}, []);
```

**Gain:** 150ms → 0ms (instant!)
**Time to implement:** 4 hours
**Risk:** Forge config size limits (need to test with large content)
**Trade-off:** Larger Confluence page storage size

---

#### 4. localStorage/IndexedDB Caching
**Show cached version instantly, fetch fresh in background**

**Implementation:**
```javascript
// On mount - instant from browser cache
const localCache = localStorage.getItem(`excerpt-${localId}`);
if (localCache) {
  setContent(JSON.parse(localCache)); // ~5ms
}

// Then fetch fresh in background
invoke('getCachedContent').then(fresh => {
  if (fresh !== localCache) {
    setContent(fresh);
    localStorage.setItem(`excerpt-${localId}`, fresh);
  }
});
```

**Gain:**
- First visit: Same (150ms)
- Return visits: 150ms → 5ms

**Time to implement:** 2 hours
**Risk:** Need to verify Forge Custom UI has localStorage access
**Cache invalidation:** Need strategy for clearing stale cache

---

#### 5. Progressive Enhancement (Text-First Rendering)
**Show plain text instantly, enhance with formatting after**

**Implementation:**
```javascript
// Phase 1: Show plain text immediately (0ms)
if (config.plainTextCache) {
  return <Text>{config.plainTextCache}</Text>;
}

// Phase 2: Load full ADF in background
useEffect(() => {
  invoke('getCachedContent').then(fullContent => {
    setContent(fullContent); // Replace with rich content
  });
}, []);
```

**Gain:** Something visible in 0ms, full content in 150ms
**Time to implement:** 2 hours
**Trade-off:** Flash of unstyled content (FOUC)

---

### Large-Effort Optimizations

#### 6. React Query with Stale-While-Revalidate
**Aggressive caching for repeat page visits**

**Implementation:**
```javascript
const { data: content } = useQuery({
  queryKey: ['cached', localId],
  queryFn: () => invoke('getCachedContent', {localId}),
  staleTime: 5 * 60 * 1000,    // Consider fresh for 5 min
  cacheTime: 30 * 60 * 1000,   // Keep in memory for 30 min
  refetchOnMount: 'always'
});
```

**Gain:**
- First load: Same (150ms)
- Return to same page: 0ms (memory cache)
- Refresh within 5 min: 0ms (considered fresh)
- Navigate away/back within 30 min: 0ms

**Time to implement:** 1 day (part of full rewrite)
**Trade-off:** Bundle size increase (~50KB)

---

## Performance Comparison Table

| Optimization | First Load | Repeat Load | Implementation | Risk | Priority |
|--------------|-----------|-------------|----------------|------|----------|
| **Skeleton UI** | Feels 2x faster | Feels 2x faster | 20 min | None | **HIGH** |
| **Batch loading** | **50x faster** (50 macros) | Same | 4 hours | Backend changes | **CRITICAL** |
| **Config caching** | **150ms → 0ms** | **0ms** | 4 hours | Size limits | HIGH |
| localStorage | Same | **150ms → 5ms** | 2 hours | May not work | MEDIUM |
| React Query | Same | **150ms → 0ms** | 1 day | Bundle size | MEDIUM |
| Progressive | **Feels instant** | Same | 2 hours | FOUC | LOW |

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Today)
1. **Skeleton loading** (20 min)
2. **Batch loading** (4 hours) - **Biggest impact for 40-80 macro pages**

**Expected result:** Blueprint pages load 50x faster (7.5s → 150ms)

### Phase 2: Zero-Latency Experiments (This Week)
3. **Test config caching viability** (1 hour testing, 4 hours implementation if viable)
4. **Test localStorage access** (30 min testing, 2 hours implementation if available)

**Expected result:** Individual macros render instantly (0-5ms) if successful

### Phase 3: Full Architecture Rewrite (Next Week)
5. React Query implementation
6. Component decomposition
7. Computed state instead of stored state

**Expected result:** Bullet-proof reliability + performance gains

---

## Critical Questions to Answer

### For Batch Loading:
- How to coordinate multiple macro instances on same page?
- Progressive rendering strategy (paint top-to-bottom)?
- Error handling if one macro fails in batch?

### For Config Caching:
- What's the Forge config object size limit?
- Does storing large ADF in config impact Confluence page performance?
- How to handle migration for existing macros?

### For localStorage:
- Does Forge Custom UI iframe have localStorage access?
- How to handle cache invalidation across browser sessions?
- Security implications of client-side caching?

---

## Notes on Blueprint Pages (40-80 Includes)

**Current performance:**
- 80 macros × 150ms = 12,000ms (12 seconds) sequential
- Even with parallel: Limited by browser connection limits (6-8 concurrent)
- Result: Painful initial page load

**With batch loading:**
- 80 macros in 1-2 batched calls = 150-300ms total
- **40-80x performance improvement**
- Critical for production viability

**Batch loading is THE highest-value optimization for this use case.**
