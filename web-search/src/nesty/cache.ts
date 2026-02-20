import { mkdir, readFile, writeFile, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней (фильтры)

const CACHE_DIR =
  process.env.NESTY_CACHE_DIR ??
  (process.env.NEWS_CACHE_DIR
    ? join(dirname(process.env.NEWS_CACHE_DIR), "nesty")
    : join(process.cwd(), ".cache", "nesty"));

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function filePath(subdir: string, key: string): string {
  const safeKey = key.length > 80
    ? createHash("sha256").update(key).digest("hex").slice(0, 16)
    : key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CACHE_DIR, subdir, `${safeKey}.json`);
}

async function readCache<T>(subdir: string, key: string): Promise<T | null> {
  const fp = filePath(subdir, key);
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

async function writeCache<T>(subdir: string, key: string, data: T, ttlMs: number): Promise<void> {
  const dir = join(CACHE_DIR, subdir);
  await ensureDir(dir);
  const payload = JSON.stringify({ expiresAt: Date.now() + ttlMs, data });
  await writeFile(filePath(subdir, key), payload, "utf-8");
}

// --- Фильтры: 30 дней ---

export async function readFiltersCache<T>(key: string): Promise<T | null> {
  return readCache("filters", key);
}

export async function writeFiltersCache<T>(key: string, data: T): Promise<void> {
  return writeCache("filters", key, data, DEFAULT_TTL_MS);
}

// --- Список объявлений: 10 минут ---

const POSTS_TTL_MS = 10 * 60 * 1000;

export async function readPostsCache<T>(url: string): Promise<T | null> {
  return readCache("posts", url);
}

export async function writePostsCache<T>(url: string, data: T): Promise<void> {
  return writeCache("posts", url, data, POSTS_TTL_MS);
}

// --- Детальные карточки: 1 час ---

const ACTUALIZED_TTL_MS = 60 * 60 * 1000;

export async function readActualizedCache<T>(postId: number): Promise<T | null> {
  return readCache("actualized", String(postId));
}

export async function writeActualizedCache<T>(postId: number, data: T): Promise<void> {
  return writeCache("actualized", String(postId), data, ACTUALIZED_TTL_MS);
}

// --- Очистка просроченных файлов ---

async function cleanupSubdir(subdir: string): Promise<void> {
  const dir = join(CACHE_DIR, subdir);
  if (!existsSync(dir)) return;
  try {
    const files = await readdir(dir);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fp = join(dir, file);
      try {
        const raw = await readFile(fp, "utf-8");
        const { expiresAt } = JSON.parse(raw) as { expiresAt: number };
        if (now >= expiresAt) await unlink(fp);
      } catch {
        // битый файл — удаляем
        try { await unlink(fp); } catch {}
      }
    }
  } catch {}
}

export async function cleanupNestyCache(): Promise<void> {
  await Promise.all([
    cleanupSubdir("posts"),
    cleanupSubdir("actualized"),
  ]);
}

setInterval(() => { cleanupNestyCache().catch(() => {}); }, 5 * 60 * 1000).unref();
