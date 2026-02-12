# Быстрый старт

## Запуск

```bash
# Из корня проекта
docker-compose build mcp-memory
docker-compose up -d mcp-memory

# Проверить статус
docker-compose ps mcp-memory

# Посмотреть логи
docker-compose logs -f mcp-memory
```

## Проверка работы

```bash
# Health check
curl http://localhost:3001/health

# Должен вернуть:
# {
#   "status": "ok",
#   "server": "mcp-memory-http",
#   "version": "0.6.3-http",
#   "memoryFile": "/data/memory.jsonl"
# }
```

## Подключение к Claude/Cursor

### Через mcp-remote

```yaml
# В конфиге MCP клиента
mcp_servers:
  memory:
    command: "npx"
    args: ["-y", "mcp-remote", "http://localhost:3001/mcp"]
```

### Прямое подключение (если поддерживается)

```json
{
  "mcpServers": {
    "memory": {
      "url": "http://localhost:3001/mcp",
      "transport": "http"
    }
  }
}
```

## Примеры использования

### Создать сущность

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
        "entities": [{
          "name": "kufar_bike_123",
          "entityType": "seen_ad",
          "observations": ["url: https://kufar.by/item/123", "price: 500 BYN"]
        }]
      }
    }
  }'
```

### Поиск

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_nodes",
      "arguments": {
        "query": "kufar"
      }
    }
  }'
```

### Прочитать весь граф

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "read_graph",
      "arguments": {}
    }
  }'
```

## Данные

Все данные хранятся в Docker volume `mcp-memory-data` в файле `/data/memory.jsonl`.

### Просмотр данных

```bash
# Зайти в контейнер
docker exec -it mcp-memory-server sh

# Посмотреть файл
cat /data/memory.jsonl
```

### Бэкап

```bash
# Экспорт данных
docker cp mcp-memory-server:/data/memory.jsonl ./backup-memory.jsonl

# Импорт данных
docker cp ./backup-memory.jsonl mcp-memory-server:/data/memory.jsonl
docker-compose restart mcp-memory
```

## Отладка

```bash
# Логи в реальном времени
docker-compose logs -f mcp-memory

# Последние 100 строк
docker-compose logs --tail=100 mcp-memory

# Перезапуск
docker-compose restart mcp-memory

# Полная пересборка
docker-compose build --no-cache mcp-memory
docker-compose up -d mcp-memory
```

## Порты

- **3001** (внешний) → **3000** (внутри контейнера)
- Можно изменить через переменную `MEMORY_PORT` в `.env`

```bash
# .env
MEMORY_PORT=3002
```
