# Деплой FS_PC на Railway

Приложение состоит из **трёх компонентов** на Railway:

| Сервис | Папка | Назначение |
|--------|-------|------------|
| **backend** | `server/` | Express API, SQLite, загрузки файлов |
| **frontend** | `client/` | React SPA (Vite) |
| **Volume** | на backend | Постоянное хранение БД и uploads |

> **PostgreSQL:** вы выбрали миграцию на PostgreSQL — это отдельная крупная задача (~400 SQL-запросов в коде). Текущая конфигурация использует **SQLite на Volume**, что позволяет опубликовать приложение сразу. Миграцию на PostgreSQL можно выполнить следующим этапом.

---

## 1. Подготовка репозитория

1. Закоммитьте и запушьте проект в GitHub (Railway подключается к Git).
2. Убедитесь, что в репозитории есть папки `server/` и `client/` с `package.json`.

---

## 2. Создание проекта на Railway

1. Откройте [railway.com](https://railway.com) → **New Project**.
2. Выберите **Deploy from GitHub repo** и укажите репозиторий FS_PC.

---

## 3. Backend (API)

### 3.1. Создать сервис

1. **+ New** → **Empty Service** (или **GitHub Repo** если Railway создал один сервис — добавьте второй).
2. Подключите тот же репозиторий.
3. **Settings → Root Directory** → `server`
4. **Settings → Watch Paths** → `server/**` (чтобы frontend не пересобирал backend)

### 3.2. Volume для данных

1. Откройте сервис backend → вкладка **Volumes**.
2. **Add Volume** → Mount Path: `/data`
3. В Volume будут храниться `projects.db` и папка `uploads/`.

### 3.3. Переменные окружения

Вкладка **Variables** сервиса backend:

```env
DATA_DIR=/data
ALLOWED_ORIGINS=https://ВАШ-FRONTEND.up.railway.app
```

После создания frontend замените URL на реальный домен (см. п. 4). Можно указать несколько через запятую.

Railway автоматически задаёт `PORT` — менять не нужно.

### 3.4. Деплой

- **Build Command:** (пусто, Nixpacks сам выполнит `npm install`)
- **Start Command:** `npm start` (из `server/railway.toml`)
- Healthcheck: `GET /api/health`
- В `server/nixpacks.toml` указаны `python311` и `gcc` — нужны для сборки нативного модуля `better-sqlite3`

После деплоя откройте **Settings → Networking → Generate Domain** и скопируйте URL backend, например `https://fs-pc-api.up.railway.app`.

---

## 4. Frontend (React)

### 4.1. Создать сервис

1. **+ New** → **Empty Service**.
2. Подключите тот же репозиторий.
3. **Settings → Root Directory** → `client`
4. **Settings → Watch Paths** → `client/**`

### 4.2. Переменные окружения (важно: нужны на этапе сборки)

```env
VITE_API_URL=https://ВАШ-BACKEND.up.railway.app
```

`VITE_*` переменные вшиваются в bundle при `npm run build`. После смены URL backend нужен **Redeploy** frontend.

### 4.3. Build & Start

Из `client/railway.toml`:

- **Build:** `npm install --include=dev && npm run build` (devDependencies нужны для Vite)
- **Start:** `npm start` → `serve` отдаёт папку `dist`

> Если сборка падает с «vite not found» — в **Settings → Build** явно укажите Build Command выше (Railway по умолчанию может ставить только production-зависимости).

Сгенерируйте публичный домен для frontend (**Settings → Networking → Generate Domain**).

### 4.4. Обновить CORS на backend

Вернитесь в Variables backend и установите:

```env
ALLOWED_ORIGINS=https://ВАШ-FRONTEND.up.railway.app
```

Redeploy backend.

---

## 5. Перенос существующих данных (локальная БД)

Если у вас уже есть `data/projects.db` и `data/uploads/` локально:

### Вариант A — через Railway CLI

```bash
npm i -g @railway/cli
railway login
railway link   # выберите проект и сервис backend
railway run -- bash
# в контейнере (если есть shell) скопируйте файлы в /data
```

### Вариант B — загрузить через CLI volume

1. Установите [Railway CLI](https://docs.railway.com/develop/cli).
2. Скопируйте локальные файлы в volume (см. [Railway Volumes docs](https://docs.railway.com/reference/volumes)).

### Вариант C — начать с пустой БД

При первом запуске `seed()` создаст шаблонные данные автоматически.

---

## 6. Проверка

1. Backend: `https://ВАШ-BACKEND.up.railway.app/api/health` → `{"ok":true}`
2. Backend: `https://ВАШ-BACKEND.up.railway.app/api/users` → список пользователей
3. Frontend: откройте домен frontend в браузере, проверьте загрузку списка проектов

---

## 7. Локальная разработка (без изменений)

```bash
npm run dev
```

- Client: http://localhost:3000  
- API: http://localhost:3001  

---

## 8. Следующий этап: PostgreSQL

Когда будете готовы к миграции на PostgreSQL:

1. **+ New → Database → PostgreSQL** в проекте Railway.
2. Подключить `DATABASE_URL=${{Postgres.DATABASE_URL}}` к backend.
3. Переписать `server/src/db.ts` с better-sqlite3 на `pg`.
4. Конвертировать ~400 синхронных запросов в async.
5. Перенести данные из SQLite (dump/import).

Это отдельный эпик; текущий деплой с SQLite + Volume полностью рабочий для production-пилота.

---

## Переменные окружения (справочник)

| Переменная | Сервис | Описание |
|------------|--------|----------|
| `PORT` | backend, frontend | Задаёт Railway автоматически |
| `DATA_DIR` | backend | Путь к данным (`/data` на Railway) |
| `ALLOWED_ORIGINS` | backend | CORS: URL frontend через запятую |
| `VITE_API_URL` | frontend (build) | Базовый URL backend без `/api` |
