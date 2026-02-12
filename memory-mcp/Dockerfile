FROM node:20-alpine

WORKDIR /app

# Копируем package files
COPY package.json tsconfig.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY index.ts ./

# Компилируем TypeScript
RUN npm run build

# Создаём директорию для данных
RUN mkdir -p /data

# Переменные окружения
ENV PORT=3000
ENV NODE_ENV=production
ENV MEMORY_FILE_PATH=/data/memory.jsonl

# Порт
EXPOSE 3000

# Запуск
CMD ["node", "dist/index.js"]
