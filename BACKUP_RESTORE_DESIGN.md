# Backup & Restore System Design

## Problem Statement

The `checkAllIncludes` worker can incorrectly identify valid embeds as orphaned (false positive), then **permanently delete** their configuration data (`macro-vars:{localId}`), causing unrecoverable data loss.

**User Impact:**
- Lost variable values
- Lost toggle states
- Lost custom insertions
- Lost internal notes
- Requires manual re-entry of all configuration

---

## Solution: Multi-Layered Data Protection

### Layer 1: Fix the Root Cause (Bug Fix)
Fix the ADF search logic to prevent false positives → See separate bug fix

### Layer 2: Soft Delete (Immediate Protection)
Instead of `storage.delete()`, mark as deleted with timestamp and backup

### Layer 3: Automatic Backups (Safety Net)
Backup before any destructive operation

### Layer 4: Audit Log (Forensics)
Track all changes to embed configurations

### Layer 5: Recovery UI (User-Facing Restore)
Admin page feature to restore deleted configurations

---

## Implementation Plan

### Phase 1: Soft Delete System (HIGH PRIORITY)

**Concept:** Never actually delete data - mark as deleted instead

#### Storage Structure:
```javascript
// Active data (current)
`macro-vars:{localId}` → {
  excerptId: "abc123",
  variableValues: {...},
  toggleStates: {...},
  customInsertions: [...],
  internalNotes: [...],
  lastSynced: "2025-01-05T19:00:00Z",
  contentHash: "sha256-xyz..."
}

// Soft-deleted data (recoverable)
`macro-vars-deleted:{localId}` → {
  ...originalData,
  deletedAt: "2025-01-05T20:00:00Z",
  deletedBy: "checkAllIncludes",
  deletionReason: "Macro not found in page content",
  canRecover: true
}
```

#### Implementation:
```javascript
// Replace this:
await storage.delete(`macro-vars:${localId}`);

// With this:
async function softDeleteMacroVars(localId, reason) {
  const data = await storage.get(`macro-vars:${localId}`);

  if (data) {
    // Move to deleted namespace with metadata
    await storage.set(`macro-vars-deleted:${localId}`, {
      ...data,
      deletedAt: new Date().toISOString(),
      deletedBy: 'checkAllIncludes',
      deletionReason: reason,
      canRecover: true
    });

    // Set expiry: auto-delete after 90 days
    // (Forge storage supports TTL)
  }

  // Remove from active namespace
  await storage.delete(`macro-vars:${localId}`);
}
```

**Benefits:**
- Data recoverable for 90 days
- No performance impact (separate namespace)
- Automatic cleanup after retention period

---

### Phase 2: Snapshot Backups Before Destructive Ops (HIGH PRIORITY)

**Concept:** Take full backup before Check All Embeds runs

#### Storage Structure:
```javascript
`backup:{timestamp}:metadata` → {
  backupId: "backup-2025-01-05T20:00:00Z",
  createdAt: "2025-01-05T20:00:00Z",
  operation: "checkAllIncludes",
  totalEmbeds: 150,
  affectedPages: 42,
  canRestore: true
}

`backup:{timestamp}:embed:{localId}` → {
  // Full snapshot of macro-vars data
  excerptId: "abc123",
  variableValues: {...},
  // ... full config
}
```

#### Implementation:
```javascript
async function createBackupBeforeCheck() {
  const timestamp = new Date().toISOString();
  const backupId = `backup-${timestamp}`;

  // Get all active embed configs
  const allKeys = await storage.query()
    .where('key', startsWith('macro-vars:'))
    .getMany();

  const embedCount = allKeys.results.length;

  // Save metadata
  await storage.set(`${backupId}:metadata`, {
    backupId,
    createdAt: timestamp,
    operation: 'checkAllIncludes',
    totalEmbeds: embedCount,
    canRestore: true
  });

  // Save each embed config
  for (const entry of allKeys.results) {
    const localId = entry.key.replace('macro-vars:', '');
    await storage.set(`${backupId}:embed:${localId}`, entry.value);
  }

  console.log(`[BACKUP] Created backup ${backupId} with ${embedCount} embeds`);
  return backupId;
}

// In checkIncludesWorker.js:
export async function handler(event, context) {
  const { progressId } = event.body;

  // CREATE BACKUP BEFORE STARTING
  const backupId = await createBackupBeforeCheck();

  await updateProgress(progressId, {
    phase: 'backup',
    percent: 5,
    status: `Created backup ${backupId}...`,
    backupId
  });

  // ... rest of check logic
}
```

**Benefits:**
- Full system state snapshot before risky operations
- Can restore entire system if check goes wrong
- Stored with operation metadata for audit trail

---

### Phase 3: Restore Functions (MEDIUM PRIORITY)

#### Function 1: Restore Single Embed from Soft Delete
```javascript
export async function restoreDeletedEmbed(req) {
  const { localId } = req.payload;

  // Get soft-deleted data
  const deletedData = await storage.get(`macro-vars-deleted:${localId}`);

  if (!deletedData) {
    return {
      success: false,
      error: 'No deleted data found for this embed'
    };
  }

  // Check if already exists (prevent double-restore)
  const existing = await storage.get(`macro-vars:${localId}`);
  if (existing) {
    return {
      success: false,
      error: 'Embed already exists - cannot restore'
    };
  }

  // Restore to active namespace (remove deletion metadata)
  const { deletedAt, deletedBy, deletionReason, canRecover, ...originalData } = deletedData;

  await storage.set(`macro-vars:${localId}`, {
    ...originalData,
    restoredAt: new Date().toISOString(),
    restoredFrom: 'soft-delete'
  });

  // Remove from deleted namespace
  await storage.delete(`macro-vars-deleted:${localId}`);

  return {
    success: true,
    localId,
    restoredAt: new Date().toISOString()
  };
}
```

#### Function 2: Restore from Backup Snapshot
```javascript
export async function restoreFromBackup(req) {
  const { backupId, localIds } = req.payload; // Restore specific embeds or all

  // Get backup metadata
  const metadata = await storage.get(`${backupId}:metadata`);

  if (!metadata || !metadata.canRestore) {
    return {
      success: false,
      error: 'Backup not found or not restorable'
    };
  }

  const restored = [];
  const skipped = [];

  // If no specific localIds provided, restore ALL from backup
  let embedsToRestore = localIds;
  if (!embedsToRestore) {
    // Query all embeds in this backup
    const backupKeys = await storage.query()
      .where('key', startsWith(`${backupId}:embed:`))
      .getMany();
    embedsToRestore = backupKeys.results.map(k =>
      k.key.replace(`${backupId}:embed:`, '')
    );
  }

  for (const localId of embedsToRestore) {
    const backupData = await storage.get(`${backupId}:embed:${localId}`);

    if (!backupData) {
      skipped.push({ localId, reason: 'Not found in backup' });
      continue;
    }

    // Check if current data exists
    const currentData = await storage.get(`macro-vars:${localId}`);

    if (currentData) {
      // Optionally: Compare and only restore if different
      // For now, skip if exists (user must manually delete first)
      skipped.push({ localId, reason: 'Already exists' });
      continue;
    }

    // Restore from backup
    await storage.set(`macro-vars:${localId}`, {
      ...backupData,
      restoredAt: new Date().toISOString(),
      restoredFrom: backupId
    });

    restored.push(localId);
  }

  return {
    success: true,
    backupId,
    restored: restored.length,
    skipped: skipped.length,
    details: { restored, skipped }
  };
}
```

#### Function 3: List Available Backups
```javascript
export async function listBackups(req) {
  const backups = await storage.query()
    .where('key', startsWith('backup-'))
    .where('key', endsWith(':metadata'))
    .getMany();

  const backupList = backups.results.map(b => ({
    backupId: b.value.backupId,
    createdAt: b.value.createdAt,
    operation: b.value.operation,
    totalEmbeds: b.value.totalEmbeds,
    canRestore: b.value.canRestore
  }));

  return {
    success: true,
    backups: backupList.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  };
}
```

---

### Phase 4: Admin UI for Recovery (MEDIUM PRIORITY)

#### New Section in Admin Page: "Data Recovery"

**Features:**
1. **View Soft-Deleted Embeds**
   - List all `macro-vars-deleted:*` entries
   - Show: localId, excerptId, deletedAt, deletionReason
   - Action: Restore button (calls `restoreDeletedEmbed`)

2. **View Backups**
   - List all available backups
   - Show: backupId, createdAt, operation, totalEmbeds
   - Action: "Restore All" or "Browse Embeds" to restore selectively

3. **Browse Backup Contents**
   - Select a backup → see all embeds in that backup
   - Compare with current state
   - Selectively restore specific embeds

4. **Audit Log Viewer**
   - Show history of deletions and restorations
   - Filter by date, operation, embed

---

### Phase 5: Audit Log System (LOW PRIORITY)

#### Track All Configuration Changes

```javascript
async function auditLogChange(localId, action, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    localId,
    action, // 'created', 'updated', 'deleted', 'restored'
    details,
    source: 'checkAllIncludes' // or 'user', 'migration', etc.
  };

  // Append to audit log (ring buffer, keep last 10,000 entries)
  const log = await storage.get('audit-log') || { entries: [] };
  log.entries.push(logEntry);

  // Keep only last 10,000
  if (log.entries.length > 10000) {
    log.entries = log.entries.slice(-10000);
  }

  await storage.set('audit-log', log);
}
```

---

## ContentHash-Based Recovery (Future Enhancement)

**Your Idea:** Use contentHash to restore configuration

### How It Would Work:

1. **Store Historical Snapshots by ContentHash**
```javascript
// When embed is saved/published
const contentHash = generateContentHash(variableValues, toggleStates, ...);

await storage.set(`content-snapshot:${contentHash}`, {
  contentHash,
  excerptId,
  variableValues,
  toggleStates,
  customInsertions,
  internalNotes,
  createdAt: new Date().toISOString()
});

// Also store in macro-vars (current approach)
await storage.set(`macro-vars:${localId}`, {
  ...config,
  contentHash  // Include hash in current config
});
```

2. **Recovery Scenario:**
If embed is orphaned but we know its contentHash (stored in usage tracking or backup):
```javascript
export async function restoreFromContentHash(req) {
  const { localId, contentHash } = req.payload;

  const snapshot = await storage.get(`content-snapshot:${contentHash}`);

  if (!snapshot) {
    return { success: false, error: 'No snapshot found for this hash' };
  }

  await storage.set(`macro-vars:${localId}`, {
    ...snapshot,
    restoredAt: new Date().toISOString(),
    restoredFrom: `contentHash:${contentHash}`
  });

  return { success: true };
}
```

**Challenges:**
- Storage cost (each unique configuration = 1 snapshot)
- Need to know contentHash to restore (how do we get it if orphaned?)
- Deduplication (same config across multiple embeds = 1 snapshot)

**Benefits:**
- Point-in-time recovery
- Can restore exact state from any moment
- Deduplication saves storage

---

## Implementation Priority

### IMMEDIATE (Fix Data Loss Bug):
1. ✅ Soft delete system (replace storage.delete)
2. ✅ Backup before Check All Embeds
3. ✅ Fix ADF search logic (separate bug fix)

### NEXT SPRINT (User-Facing Recovery):
4. Restore functions (restoreDeletedEmbed, restoreFromBackup)
5. Admin UI for recovery
6. List backups endpoint

### FUTURE ENHANCEMENTS:
7. Audit log system
8. ContentHash-based recovery
9. Scheduled automatic backups
10. Backup export/import (download backups as JSON)

---

## Storage Impact Analysis

### Current State:
- ~2-3 embeds × ~1KB each = ~3KB total
- Negligible storage usage

### With Backup System:
- Soft delete: 2× current (3KB → 6KB) - expires after 90 days
- Backups: 1 full snapshot per Check All Embeds run
  - Assume 1 backup/week × 52 weeks = 52 backups/year
  - Each backup: ~3KB
  - Total: ~156KB/year
- Very manageable for Forge storage limits

### Optimization:
- Compress backup data (JSON.stringify + gzip simulation)
- Expire old backups after 90 days
- Keep only last 10 backups (configurable)

---

## Testing Plan

### Test 1: Soft Delete Recovery
1. Create test embed with variables
2. Trigger soft delete (simulate Check All Embeds marking it orphaned)
3. Verify data in `macro-vars-deleted:*`
4. Call restoreDeletedEmbed
5. Verify full restoration

### Test 2: Backup & Restore
1. Create 3 test embeds with different configs
2. Create backup
3. Delete all 3 embeds (simulate mass orphaning)
4. Restore from backup
5. Verify all 3 restored correctly

### Test 3: ContentHash Recovery (Future)
1. Create embed, save → generates contentHash
2. Orphan the embed
3. Restore using contentHash
4. Verify exact configuration restored

---

## Documentation Updates Needed

- Admin page: Add "Data Recovery" section docs
- User guide: Explain backup system and recovery process
- Developer docs: Document backup/restore APIs
- Incident response: "What to do if embeds get orphaned"

---

## Rollout Plan

### Phase 1 (Emergency Fix - Deploy ASAP):
- Soft delete system
- Backup before Check All Embeds
- Disable Check All Embeds button until tested

### Phase 2 (Next Deploy - 1-2 days):
- Fix ADF search logic with logging
- Test with real data
- Re-enable Check All Embeds in dry-run mode

### Phase 3 (Following Deploy - 1 week):
- Admin UI for viewing soft-deleted embeds
- Restore functions
- Full testing suite

### Phase 4 (Future):
- ContentHash recovery
- Audit log
- Export/import backups
