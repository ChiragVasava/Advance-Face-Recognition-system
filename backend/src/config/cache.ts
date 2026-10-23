import NodeCache from "node-cache";

/**
 * In-memory LRU-style cache for user records.
 *
 * During real-time face detection, the recognition controller needs to
 * map a predicted face ID to a user name. Querying PostgreSQL on every
 * video frame would bottleneck the feed under load.
 *
 * This cache stores `{ id, name, department }` objects keyed by
 * `"user:<id>"` with a 5-minute TTL. On cache miss the controller falls
 * back to a single Prisma query and then re-populates the cache.
 *
 * TTL is intentionally short so that admin renames / deactivations
 * propagate within minutes without requiring a server restart.
 */
export const userCache = new NodeCache({
  stdTTL: 300,       // 5-minute default TTL
  checkperiod: 60,   // prune expired keys every 60 s
  useClones: false,  // store references for performance (objects are read-only here)
  maxKeys: 1000,
});
