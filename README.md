# Bitrix24 MCP Server — Multi-tenant Remote

Публичный MCP сервер для Bitrix24. Один деплой → неограниченное количество пользователей, каждый со своим webhook.

## Как это работает

```
Пользователь → Claude.ai → OAuth → вводит свой Bitrix24 webhook → готово
```

Webhook шифруется в токен через **AES-256-GCM**. Сервер не хранит никаких данных — всё в токене.

---

## Быстрый старт

### 1. Генерируем ключ шифрования

```bash
openssl rand -base64 32
```

### 2. Создаём `.env`

```bash
cp .env.example .env
# Редактируем:
ENCRYPTION_KEY=<ключ из шага 1>
BASE_URL=https://bitrix-mcp.ваш-домен.com
```

### 3. Запуск через Docker Compose (с Traefik)

```bash
docker compose up -d
```

### 4. Запуск для тестирования (без Traefik)

Раскомментируйте секцию `ports` в `docker-compose.yml`, или:

```bash
npm install
npm run dev    # dev режим с hot-reload
# или
npm run build && npm start
```

---

## Подключение в Claude.ai

1. Claude.ai → **Settings** → **Connectors** → **Add custom connector**
2. Вводишь URL: `https://bitrix-mcp.ваш-домен.com/mcp`
3. Нажимаешь **Add** → Claude предложит **Connect**
4. Откроется страница авторизации — вводишь **Bitrix24 webhook URL**
5. Готово!

### Как создать webhook в Bitrix24

1. Bitrix24 → **Приложения** → **Разработчикам** → **Входящий вебхук**
2. Добавить webhook → права: **task** + **user**
3. Скопировать URL: `https://ВАШ-ДОМЕН.bitrix24.ru/rest/USER_ID/TOKEN/`

---

## Доступные инструменты (17 tools)

| Tool | Описание |
|------|----------|
| `bitrix_whoami` | Информация о текущем пользователе |
| `bitrix_users_search` | Поиск пользователей по имени/email |
| `bitrix_users_list` | Список всех пользователей |
| `bitrix_tasks_list` | Список задач с фильтрами |
| `bitrix_tasks_get` | Детали задачи |
| `bitrix_tasks_create` | Создание задачи |
| `bitrix_tasks_update` | Обновление задачи |
| `bitrix_tasks_start` | Начать выполнение |
| `bitrix_tasks_pause` | Приостановить |
| `bitrix_tasks_complete` | Завершить задачу |
| `bitrix_tasks_defer` | Отложить |
| `bitrix_tasks_renew` | Возобновить |
| `bitrix_tasks_delegate` | Делегировать |
| `bitrix_tasks_comments_list` | Список комментариев |
| `bitrix_tasks_comment_add` | Добавить комментарий |
| `bitrix_tasks_counters` | Счётчики (дашборд) |
| `bitrix_tasks_overdue` | Просроченные задачи |

---

## Переменные окружения

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `ENCRYPTION_KEY` | ✅ | Ключ шифрования AES-256 (min 16 символов, рекомендуется 32 байта base64) |
| `BASE_URL` | ✅ | Публичный URL сервера (без `/` в конце) |
| `PORT` | — | Порт (default: `3000`) |
| `LOG_LEVEL` | — | `trace/debug/info/warn/error` (default: `info`) |
| `NODE_ENV` | — | `development/production` (default: `production`) |

---

## Безопасность

- Webhook URL никогда не хранится на сервере — только в токене Claude.ai
- Шифрование: AES-256-GCM с уникальным IV для каждого токена
- PKCE (S256) обязателен для OAuth — защита от перехвата кода
- Rate limiting: `/authorize` 10/10мин, `/token` 30/мин, `/mcp` 120/мин
- HTTPS-only (HSTS заголовок)
- Все токены, вебхуки и коды редактируются из логов
