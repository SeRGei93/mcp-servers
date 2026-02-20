import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

const CACHE_DIR =
  process.env.AVBY_CACHE_DIR ??
  (process.env.NEWS_CACHE_DIR
    ? join(dirname(process.env.NEWS_CACHE_DIR), "avby")
    : join(process.cwd(), ".cache", "avby"));

async function ensureDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

function filePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

export async function readAvbyCache<T>(key: string): Promise<T | null> {
  const fp = filePath(key);
  if (!existsSync(fp)) return null;
  try {
    const raw = await readFile(fp, "utf-8");
    const { expiresAt, data } = JSON.parse(raw) as { expiresAt: number; data: T };
    if (Date.now() < expiresAt) return data;
    return null;
  } catch {
    return null;
  }
}

export async function writeAvbyCache<T>(key: string, data: T): Promise<void> {
  await ensureDir();
  const payload = JSON.stringify({ expiresAt: Date.now() + TTL_MS, data });
  await writeFile(filePath(key), payload, "utf-8");
}
