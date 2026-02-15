.PHONY: help install build build-web-search build-memory up down logs ps clean watch dev

# Default target
help:
	@echo "MCP Servers - Доступные команды:"
	@echo ""
	@echo "  make install        - Установить зависимости для всех серверов"
	@echo "  make build          - Собрать все серверы"
	@echo "  make build-web-search  - Собрать только web-search"
	@echo "  make build-memory   - Собрать только memory-mcp"
	@echo ""
	@echo "  make up             - Запустить все сервисы (docker compose up -d)"
	@echo "  make down           - Остановить все сервисы"
	@echo "  make logs           - Показать логи"
	@echo "  make ps             - Статус контейнеров"
	@echo ""
	@echo "  make watch          - Режим watch для разработки (web-search)"
	@echo "  make clean          - Удалить артефакты сборки и node_modules"

# Docker
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f web-search-mcp mcp-memory

ps:
	docker compose ps

# Сборка Docker-образов
rebuild:
	docker compose build --no-cache web-search-mcp mcp-memory
	docker compose up -d

# Очистка
clean:
	rm -rf web-search/build web-search/node_modules
	rm -rf memory-mcp/dist memory-mcp/node_modules
