import { CACHE_TTL, CACHE_DIR } from "./config.js";
import { createCache } from "./utils/cache.js";

const cache = createCache<string>({
  dir: CACHE_DIR.fetch,
  ttlMs: CACHE_TTL.fetch,
  cleanupIntervalMs: 5 * 60 * 1000,
});

cache.startCleanupTimer();

export const readFetchCache = (url: string) => cache.read(url);
export const writeFetchCache = (url: string, markdown: string) => cache.write(url, markdown);
export const cleanExpiredFetchCache = () => cache.cleanup();
