import { createHash } from "crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { FETCH_CACHE_DIR, FETCH_CACHE_TTL_MS } from "./config.js";

/**
 * Ключ кеша: hash(url с GET-параметрами).
 */
function getCacheKey(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

function getCacheFilePath(key: string): string {
  return join(FETCH_CACHE_DIR, `${key}.json`);
}

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(FETCH_CACHE_DIR)) {
    await mkdir(FETCH_CACHE_DIR, { recursive: true });
  }
}

export async function readFetchCache(url: string): Promise<string | null> {
  const key = getCacheKey(url);
  const filePath = getCacheFilePath(key);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, "utf-8");
    const { expiresAt, data } = JSON.parse(raw) as {
      expiresAt: number;
      data: string;
    };
    if (Date.now() < expiresAt) return data;
    return null;
  } catch {
    return null;
  }
}

export async function writeFetchCache(url: string, markdown: string): Promise<void> {
  await ensureCacheDir();
  const key = getCacheKey(url);
  const filePath = getCacheFilePath(key);
  const payload = JSON.stringify({
    expiresAt: Date.now() + FETCH_CACHE_TTL_MS,
    data: markdown,
  });
  await writeFile(filePath, payload, "utf-8");
}

/**
 * Удаляет файлы кеша fetch_url с истёкшим expiresAt.
 */
export async function cleanExpiredFetchCache(): Promise<number> {
  if (!existsSync(FETCH_CACHE_DIR)) return 0;
  const now = Date.now();
  let deleted = 0;
  try {
    const files = await readdir(FETCH_CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = join(FETCH_CACHE_DIR, file);
      try {
        const raw = await readFile(filePath, "utf-8");
        const { expiresAt } = JSON.parse(raw) as { expiresAt: number };
        if (now >= expiresAt) {
          await unlink(filePath);
          deleted++;
        }
      } catch {
        // Повреждённый файл — удаляем
        await unlink(filePath).catch(() => {});
        deleted++;
      }
    }
  } catch (err) {
    console.error("[WARN] fetch cache cleanup failed:", err);
  }
  return deleted;
}
