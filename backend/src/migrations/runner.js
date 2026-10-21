import Migration from "#src/models/migration.model.js";
import logger from "#config/logger.js";
import { MIGRATIONS } from "./index.js";

// A claim this old belongs to a process that died mid-run.
export const STALE_CLAIM_MS = 30 * 60 * 1000;

// Takes a migration for this process. Returns false when it is done or
// another instance is running it, so every server can call this on start.
const claim = async (id, now) => {
  try {
    await Migration.create({ _id: id, status: "running", startedAt: now });
    return true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const stale = await Migration.findOneAndUpdate(
      { _id: id, status: "running", startedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      { $set: { startedAt: now } }
    );
    return Boolean(stale);
  }
};

// Applies each pending migration once. A failed one is released and logged
// rather than thrown, so the app keeps running and the next start retries it.
export const runMigrations = async (migrations = MIGRATIONS, { now = () => new Date() } = {}) => {
  const results = [];
  for (const { id, run } of migrations) {
    if (!(await claim(id, now()))) {
      results.push({ id, status: "skipped" });
      continue;
    }
    try {
      const result = (await run()) ?? null;
      await Migration.updateOne(
        { _id: id },
        { $set: { status: "done", finishedAt: now(), result } }
      );
      logger.info("Migration applied", { id, result });
      results.push({ id, status: "applied", result });
    } catch (error) {
      await Migration.deleteOne({ _id: id, status: "running" });
      logger.error("Migration failed; it will run again on the next start", {
        id,
        error: error.message,
      });
      results.push({ id, status: "failed", error: error.message });
    }
  }
  return results;
};
