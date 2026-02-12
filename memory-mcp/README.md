# MCP Memory Server (HTTP)

Модифицированная версия официального [@modelcontextprotocol/server-memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) от Anthropic с добавлением HTTP/SSE transport.

## Описание

Это оригинальный Knowledge Graph Memory Server от Anthropic, в который добавлена поддержка HTTP/SSE transport вместо stdio. Вся логика работы с графом знаний осталась без изменений.

## Возможности

- ✅ **Knowledge Graph** - хранение entities, relations, observations
- ✅ **HTTP/SSE transport** - работает через веб
- ✅ **Persistent storage** - данные сохраняются между перезапусками
- ✅ **Lightweight** - ~50-100MB RAM

## Инструменты Memory Server

- `create_entities` - создать сущности в графе
- `create_relations` - создать связи между сущностями
- `add_observations` - добавить наблюдения к сущностям
- `delete_entities` - удалить сущности
- `delete_observations` - удалить наблюдения
- `delete_relations` - удалить связи
- `read_graph` - прочитать весь граф
- `search_nodes` - поиск по узлам графа
- `open_nodes` - открыть конкретные узлы

## Запуск

### Через Docker Compose

```bash
# Запустить все сервисы
docker-compose up -d

# Только memory сервер
docker-compose up -d mcp-memory

# Посмотреть логи
docker-compose logs -f mcp-memory
```

### Локально (для разработки)

```bash
cd memory-mcp
npm install
npm start
```

## Использование

### Подключение через mcp-remote

```yaml
# config.yaml
mcp_servers:
  memory:
    command: "npx"
    args: ["-y", "mcp-remote", "http://localhost:3001/mcp"]
```

### Примеры запросов

**Health check:**
```bash
curl http://localhost:3001/health
```

**Информация о сервере:**
```bash
curl http://localhost:3001/
```

**MCP запрос (JSON-RPC через HTTP POST):**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_entities",
      "arguments": {
        "entities": [
          {
            "name": "test_entity",
            "entityType": "example",
            "observations": ["This is a test"]
          }
        ]
      }
    }
  }'
```

## Переменные окружения

- `PORT` - порт сервера (по умолчанию: 3000)
- `MEMORY_PORT` - внешний порт (по умолчанию: 3001)
- `NODE_ENV` - окружение (production/development)

## Архитектура

```
Client (mcp-remote)
    ↓ HTTP POST /mcp
Express HTTP Server
    ↓ statelessHandler
MCP Server (Anthropic SDK)
    ↓
KnowledgeGraphManager
    ↓
Knowledge Graph (JSONL file)
```

## Отличия от оригинала

- ✅ **Streamable HTTP transport** вместо stdio (как в web-search сервисе)
- ✅ **Express + statelessHandler** для обработки HTTP запросов
- ✅ **Все остальное идентично** оригинальному серверу от Anthropic
- ✅ **Та же версия SDK** (@modelcontextprotocol/sdk ^1.26.0)
- ✅ **Тот же формат данных** (JSONL)
- ✅ **Stateless режим** - каждый запрос независим

## Хранение данных

Данные хранятся в Docker volume `mcp-memory-data` и сохраняются между перезапусками контейнера.

## Отладка

```bash
# Проверить активные соединения
curl http://localhost:3001/health

# Посмотреть логи в реальном времени
docker-compose logs -f mcp-memory

# Зайти в контейнер
docker exec -it mcp-memory-server sh
```

## Лицензия

MIT
