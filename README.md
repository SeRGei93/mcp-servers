# MCP Servers Collection

Коллекция MCP (Model Context Protocol) серверов для интеграции с AI-ассистентами.

## Доступные серверы

### 🔍 Web Search MCP Server

MCP-сервер для веб-поиска с использованием SearXNG (приватный метапоисковик).

**Возможности:**
- Поиск в интернете через множество поисковых систем (Google, Yandex, Bing и др.)
- Приватность - не отслеживает запросы
- Настраиваемые движки поиска
- Rate limiting
- Кеширование результатов через Redis

**Быстрый старт:**

```bash
# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Проверить работу (на сервере)
curl http://localhost:3000/
curl "http://localhost:8080/search?q=test&format=json"
```

**Конфигурация для Cursor:**

Добавьте в настройки MCP:

```json
{
  "mcpServers": {
    "web-search": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Если сервер удаленный, используйте SSH-туннель:

```bash
ssh -L 3000:localhost:3000 user@server
```

## Документация

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Подробная инструкция по развертыванию
- [web-search/README.md](./web-search/README.md) - Документация Web Search MCP Server

## Архитектура

```
┌─────────────────┐
│  Cursor IDE     │
│  (MCP Client)   │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│ web-search-mcp  │ ← MCP Server (Node.js)
│   (port 3000)   │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│    SearXNG      │ ← Метапоисковик
│   (port 8080)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│     Redis       │ ← Кеш
│   (port 6379)   │
└─────────────────┘
```

## Требования

- Docker и Docker Compose
- Минимум 512MB RAM
- Сетевое подключение для поисковых запросов

## Лицензия

MIT
