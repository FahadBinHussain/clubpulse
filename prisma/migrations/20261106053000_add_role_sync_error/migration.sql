-- Track why the last role sync failed so the failure can be surfaced in the UI
-- instead of silently downgrading the user to GUEST.
ALTER TABLE "users" ADD COLUMN     "roleSyncError" TEXT;
