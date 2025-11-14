/**
 * Backup Manager Module
 *
 * Creates full system backups before destructive operations.
 * Allows recovery if cleanup operations go wrong.
 *
 * Backup Strategy:
 * - Snapshot all `macro-vars:*` configurations to `backup-{timestamp}:*` namespace
 * - Store backup metadata for recovery operations
 * - Backups persist indefinitely (manual cleanup required)
 */

import { storage, startsWith } from '@forge/api';

/**
 * Create a full backup of all embed configurations before running destructive operations
 * @param {string} operation - The operation triggering the backup (e.g., 'checkAllIncludes')
 * @returns {Promise<string>} The backupId for recovery operations
 */
export async function createBackupSnapshot(operation = 'checkAllIncludes') {
  const timestamp = new Date().toISOString();
  const backupId = `backup-${timestamp}`;

  console.log(`[BACKUP] Creating full system backup...`);
  console.log(`[BACKUP] Backup ID: ${backupId}`);

  try {
    // Query all active embed configurations
    const allKeys = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    const embedCount = allKeys.results.length;

    console.log(`[BACKUP] Found ${embedCount} embed configurations to backup`);

    // Save backup metadata
    await storage.set(`${backupId}:metadata`, {
      backupId,
      createdAt: timestamp,
      operation,
      totalEmbeds: embedCount,
      canRestore: true,
      version: '1.0'
    });

    console.log(`[BACKUP] Saved backup metadata`);

    // Save each embed configuration to backup namespace
    let savedCount = 0;
    for (const entry of allKeys.results) {
      const localId = entry.key.replace('macro-vars:', '');
      await storage.set(`${backupId}:embed:${localId}`, entry.value);
      savedCount++;

      // Log progress every 10 embeds
      if (savedCount % 10 === 0) {
        console.log(`[BACKUP] Progress: ${savedCount}/${embedCount} embeds backed up`);
      }
    }

    console.log(`[BACKUP] ✅ Backup complete: ${backupId}`);
    console.log(`[BACKUP] Backed up ${savedCount} embed configurations`);
    console.log(`[BACKUP] Backup can be used to restore data if needed`);

    return backupId;
  } catch (error) {
    console.error(`[BACKUP] ❌ Failed to create backup:`, error);
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Restore all embeds from a backup
 * @param {string} backupId - Backup ID to restore from
 * @returns {Promise<{success: boolean, restored: number, error?: string}>}
 */
export async function restoreFromBackup(backupId) {
  console.log(`[BACKUP] Restoring from backup: ${backupId}`);

  try {
    // Verify backup exists
    const metadata = await storage.get(`${backupId}:metadata`);
    if (!metadata) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Query all backup entries
    const backupKeys = await storage.query()
      .where('key', startsWith(`${backupId}:embed:`))
      .getMany();

    let restoredCount = 0;
    for (const entry of backupKeys.results) {
      const localId = entry.key.replace(`${backupId}:embed:`, '');
      await storage.set(`macro-vars:${localId}`, entry.value);
      restoredCount++;

      if (restoredCount % 10 === 0) {
        console.log(`[BACKUP] Restored ${restoredCount}/${backupKeys.results.length} embeds`);
      }
    }

    console.log(`[BACKUP] ✅ Restore complete: ${restoredCount} embeds restored`);

    return {
      success: true,
      restored: restoredCount
    };
  } catch (error) {
    console.error(`[BACKUP] ❌ Restore failed:`, error);
    return {
      success: false,
      restored: 0,
      error: error.message
    };
  }
}
