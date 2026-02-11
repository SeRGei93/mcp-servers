# Web Search MCP Server

MCP-сервер для веб-поиска и чтения страниц через HTTP transport (`streamable-http`).
Сервис использует `SearXNG` как поисковый backend и отдает результат в удобном текстовом формате для LLM.

## Что здесь есть

- `web_search` - один поисковый запрос (с количеством результатов, SafeSearch и регионом).
- `web_search_batch` - пакетный поиск по нескольким запросам параллельно.
- `fetch_url` - загрузка страницы по URL, извлечение основного контента и конвертация в Markdown.
- HTTP endpoint MCP: `POST /mcp`.
- Служебные endpoint:
  - `GET /` - информация о сервисе.
  - `GET /health` - healthcheck.

## Требования

- Node.js `>= 18` (для локального запуска).
- Запущенный `SearXNG` (локально, в Docker или удаленно).

## Быстрый запуск через Docker Compose (рекомендуется)

Из корня репозитория:

```bash
docker compose up -d --build
```

По умолчанию сервис будет доступен на `http://localhost:3000`, MCP endpoint:

```text
http://localhost:3000/mcp
```

Проверка:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

## Локальный запуск (без Docker)

В каталоге `web-search`:

```bash
npm install
npm run build
PORT=3000 SEARXNG_URL=http://localhost:8080 npm start
```

Если нужно, можно использовать watch-режим компиляции:

```bash
npm run watch
```

## Как подключиться (главное)

Подключение выполняется как к MCP-серверу с transport `streamable-http` по URL:

```text
http://localhost:3000/mcp
```

Пример конфигурации клиента MCP (например, для Cursor/другого клиента, который поддерживает streamable HTTP):

```json
{
  "mcpServers": {
    "web-search": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

После подключения в клиенте будут доступны инструменты:
- `web_search`
- `web_search_batch`
- `fetch_url`

## Основные переменные окружения

- `PORT` - порт HTTP сервера (по умолчанию `3000`).
- `SEARXNG_URL` - URL SearXNG backend (по умолчанию `http://searxng:8080`).
- `SEARXNG_ENGINES` - поисковые движки (`google,yandex` по умолчанию).
- `SEARXNG_CATEGORIES` - категории поиска (по умолчанию `general`).
- `SEARXNG_TIMEOUT_MS` - timeout запроса в SearXNG (по умолчанию `12000`).
- `SEARXNG_RETRIES` - количество ретраев (по умолчанию `2`).
- `SEARXNG_RETRY_BACKOFF_MS` - backoff между ретраями (по умолчанию `350`).
- `SEARXNG_USERNAME`, `SEARXNG_PASSWORD` - basic auth для SearXNG (опционально).
- `RATE_LIMIT_PER_SECOND` - лимит запросов в секунду (по умолчанию `20`).
- `RATE_LIMIT_PER_MONTH` - месячный лимит запросов (по умолчанию `15000`).
- `MAX_BATCH_QUERIES` - максимум запросов в `web_search_batch` (по умолчанию `8`).

## Примечания

- Если `SearXNG` недоступен, инструменты поиска будут возвращать ошибку backend.
- `fetch_url` принимает только HTML-страницы; для других content-type вернет ошибку.
- Поиск по регионам поддерживает как коды (`ru-ru`, `us-en`), так и алиасы (`ru`, `by`, `belarus`, `usa` и т.д.).
