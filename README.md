# Система визуализации научных публикаций OpenAlex

Веб-приложение для анализа и визуализации научных публикаций на основе данных [OpenAlex](https://openalex.org). Включает интерактивную карту, граф связей, таблицы и статистику.

---

## Возможности

- Карта географического распределения публикаций по аффилиациям авторов
- Граф связей: публикации, авторы, журналы, темы
- Таблицы с фильтрацией и поиском
- Счётчики: публикации, журналы, авторы, аффилиации
- REST API для доступа к данным

---

## Структура проекта

```
├── interface/                  # Веб-интерфейс
│   ├── VKR1.html               # Главная страница
│   ├── vkr1_app.js             # Логика приложения
│   └── vkr1_styles.css         # Стили
├── database/                   # Работа с БД
│   ├── db.sql                  # Схема PostgreSQL
│   ├── setup_pg_database.py    # Загрузка данных в БД
│   └── build_separate_databases.py
├── scripts/
│   └── import.py               # Загрузка публикаций из OpenAlex API
├── geocoding/                  # Геокодирование аффилиаций
│   ├── fetch_geo.py            # Через OpenAlex API
│   └── fetch_geo_nominatim.py  # Через Nominatim (fallback)
├── openalex_data/              # Данные (JSON, CSV)
│   └── graph_data/             # Узлы и рёбра графа
├── docs/
│   └── СТРУКТУРА_ВКР.md        # Подробная документация проекта
├── openalex_server.py          # HTTP-сервер + REST API
├── pg_config.py                # Настройки подключения к PostgreSQL
├── dump.sql                    # Дамп базы данных
└── start_openalex_server.bat   # Запуск сервера (Windows)
```

---

## Быстрый старт

### 1. Требования

- Python 3.9+
- PostgreSQL 14+

```bash
pip install psycopg2-binary
```

### 2. Настройка базы данных

Отредактируй `pg_config.py`:

```python
PG_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "openalex_db",
    "user": "postgres",
    "password": "ваш_пароль",
}
```

Создай БД и примени схему:

```bash
createdb -U postgres openalex_db
psql -U postgres -d openalex_db -f database/db.sql
```

Или восстанови из дампа:

```bash
psql -U postgres -d openalex_db -f dump.sql
```

### 3. Загрузка данных (если нет дампа)

```bash
# Скачать публикации из OpenAlex
python scripts/import.py

# Загрузить в PostgreSQL
python database/setup_pg_database.py

# Геокодировать аффилиации
python geocoding/fetch_geo.py
```

### 4. Запуск сервера

```bash
# Windows
start_openalex_server.bat

# Или напрямую
python openalex_server.py
```

Открыть в браузере: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## База данных

7 таблиц PostgreSQL:

| Таблица | Описание |
|---|---|
| `journals` | Научные журналы |
| `publications` | Публикации (title, doi, year, abstract) |
| `persons` | Авторы |
| `affiliations` | Организации авторов с координатами |
| `publication_authors` | Связь публикация ↔ автор (N:M) |
| `publication_topics` | Темы публикаций |
| `publication_keywords` | Ключевые слова публикаций |

ER-диаграмма и подробное описание — в [`docs/СТРУКТУРА_ВКР.md`](docs/СТРУКТУРА_ВКР.md).

---

## API

| Эндпоинт | Описание |
|---|---|
| `GET /api/articles` | Список публикаций с авторами, темами, аффилиациями |
| `GET /api/article/{id}` | Детали публикации (abstract, doi) |
| `GET /api/stats` | Статистика по таблицам БД |
| `GET /api/data-tables` | Полные данные всех таблиц + граф |
