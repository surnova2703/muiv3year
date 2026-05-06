# История разработки проекта VKR

Проект — веб-приложение для анализа и визуализации научных публикаций (OpenAlex).
Стек: PostgreSQL, Python (сервер + скрипты), HTML/JS (Leaflet → Plotly + D3).

> Этапы, отмеченные *(реконструкция)*, восстановлены приближённо — точных данных не сохранилось.

---

## Этап 1 — Первый интерфейс: D3-граф + Leaflet + локальный JSON
**28 сентября 2025**

Первый полноценный рабочий интерфейс: три панели, граф на D3, карта на Leaflet,
загрузка и сохранение данных из локального JSON-файла. Данные встроены прямо в код.

### Макет — три колонки

```html
<body style="display: grid; grid-template-columns: 280px 1fr 420px; height: 100vh;">
  <div id="sidebar"><!-- информация о выбранной публикации --></div>
  <svg id="graph"><!-- D3 force-граф --></svg>
  <div id="map"><!-- Leaflet карта --></div>
</body>
```

### Встроенные пример-данные

```javascript
let metadata = [
  {
    id: "p1",
    title: "Visualization of scientific maps using metadata",
    authors: ["Ivanov I.", "Petrova P."],
    year: 2023,
    journal: "Journal of InfoVis",
    abstract: "We propose a method for building interactive science maps...",
    keywords: ["visualization", "science maps"],
    affiliation_country: "Germany"
  },
  {
    id: "p2",
    title: "Keyword extraction from publication metadata",
    authors: ["Sidorov S."],
    year: 2022,
    journal: "Data Mining Letters",
    keywords: ["keywords", "tf-idf"],
    affiliation_country: "United Kingdom"
  }
];
```

### D3 force-граф — три типа узлов

```javascript
function buildGraph(metadata) {
  const nodes = [], edges = [];
  const journals = new Map(), keywords = new Map();

  metadata.forEach(m => {
    nodes.push({ id: "pub::" + m.id, type: "publication", label: m.title, ...m });

    if (!journals.has(m.journal)) {
      journals.set(m.journal, "journal::" + m.journal);
      nodes.push({ id: "journal::" + m.journal, type: "journal", label: m.journal });
    }
    edges.push({ source: "pub::" + m.id, target: journals.get(m.journal) });

    (m.keywords || []).forEach(kw => {
      if (!keywords.has(kw)) {
        keywords.set(kw, "kw::" + kw);
        nodes.push({ id: "kw::" + kw, type: "keyword", label: kw });
      }
      edges.push({ source: "pub::" + m.id, target: keywords.get(kw) });
    });
  });
  return { nodes, edges };
}

// Размер и цвет зависят от типа узла
node.append("circle")
  .attr("r", d => d.type === "publication" ? 8 : (d.type === "journal" ? 6 : 5))
  .attr("fill", d => d.type === "publication" ? "#1f77b4"
                   : (d.type === "journal"     ? "#6c757d" : "#adb5bd"))
  .on("click", (e, d) => showDetails(d));
```

### Leaflet карта по стране аффилиации

Первая версия запрашивала Nominatim при каждом клике:
```javascript
fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${pub.affiliation_country}`)
  .then(r => r.json())
  .then(loc => {
    L.marker([loc[0].lat, loc[0].lon]).bindPopup(pub.title).addTo(markersLayer);
  });
```

Вторая версия (того же дня) — хардкод центров стран, без сетевых запросов:
```javascript
const countryCenters = {
  "germany":        [51.1657, 10.4515],
  "united kingdom": [55.3781, -3.4360],
  "france":         [46.2276,  2.2137],
  "usa":            [37.0902, -95.7129],
  "russia":         [61.524,  105.3188]
};

function renderMap(metadata) {
  metadata.forEach(m => {
    const coord = countryCenters[m.affiliation_country?.toLowerCase()];
    if (coord) L.marker(coord).bindPopup(`<b>${m.title}</b>`).addTo(map);
  });
}
```

### Загрузка и сохранение JSON

```javascript
document.getElementById("upload").addEventListener("change", function(e) {
  const reader = new FileReader();
  reader.onload = event => {
    metadata = JSON.parse(event.target.result);
    renderGraph(metadata);
    renderMap(metadata);
  };
  reader.readAsText(e.target.files[0]);
});

function downloadJSON() {
  const blob = new Blob([JSON.stringify(publications, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "publications.json";
  a.click();
}
```

---

## Этап 2 — Первая попытка миграции на PostgreSQL
**29 сентября 2025 · `pg_config.py`, `db.sql`, `setup_pg_database.py`, `build_separate_databases.py`, `openalex_server.py`**

До этого приложение работало с `.sqlproj`-файлами (SQLite). Выполнена попытка
полной миграции на PostgreSQL.

### Создан `pg_config.py`

```python
PG_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "openalex_db",
    "user": "postgres",
    "password": "Koshka123",
    "client_encoding": "utf8",
}
```

### Проблема — UnicodeDecodeError на Russian Windows

PostgreSQL возвращает сообщения об ошибках в cp1251, Python ожидает UTF-8.

```python
def get_conn():
    try:
        return psycopg2.connect(**PG_CONFIG)
    except UnicodeDecodeError as exc:
        try:
            msg = exc.object.decode("cp1251")
        except Exception:
            msg = repr(exc.object)
        raise Exception(msg) from None
```

### Проблема — PostgreSQL не запускался (диск переполнен)

Только 13 МБ свободного места. После освобождения ~1 ГБ:
```
net start postgresql-x64-18
# Служба успешно запущена.
```

### Расширена схема `db.sql`

Добавлены новые таблицы и поля:
```sql
CREATE TABLE publication_topics (
    id             SERIAL PRIMARY KEY,
    publication_id INTEGER REFERENCES publications(publication_id) ON DELETE CASCADE,
    topic_name     TEXT NOT NULL,
    score          DOUBLE PRECISION
);
CREATE TABLE publication_keywords ( ... );

-- В affiliations добавлены:
institution_id  TEXT,
latitude        DOUBLE PRECISION,
longitude       DOUBLE PRECISION
```

### Нерешённая проблема — MemoryError

```
MemoryError
File "build_separate_databases.py", line 248
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
```

`article_data.json` весит 202 МБ — не помещается в RAM целиком.
Установлен `ijson`, но применить не успели — перенесено на следующую сессию.

---

## Этап 3 — Первая успешная загрузка данных в PostgreSQL *(реконструкция)*
**~Октябрь 2025**

После MemoryError в `build_separate_databases.py` заменили `json.loads` на потоковое
чтение через `ijson`. Данные успешно загружены в PostgreSQL впервые.

```python
# Было:
data = json.loads(JSON_PATH.read_text(encoding="utf-8"))  # MemoryError на 202 МБ

# Стало:
with JSON_PATH.open("rb") as f:
    for group in ijson.items(f, "item"):
        for article in group.get("articles") or []:
            process_article(article)
```

Сервер `openalex_server.py` доработан — эндпоинт `/api/articles` начал отдавать
реальные данные из PostgreSQL вместо хардкода.

```python
@app.get("/api/articles")
def get_articles():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT publication_id, title, publication_year FROM publications LIMIT 500")
        return jsonify([dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()])
```

**Результат:** база данных наполнена, сервер отвечает реальными статьями.

---

## Этап 4 — Подключение интерфейса к серверу *(реконструкция)*
**~Ноябрь 2025**

Интерфейс из Этапа 1 переключён с локального JSON на сервер. Кнопка «Загрузить JSON»
заменена на «Загрузить из базы данных».

```javascript
// Было: загрузка из файла
reader.onload = event => {
  metadata = JSON.parse(event.target.result);
  renderGraph(metadata);
};

// Стало: загрузка с сервера
async function loadFromServer() {
  const response = await fetch("http://localhost:8000/api/articles");
  metadata = await response.json();
  renderGraph(metadata);
  renderMap(metadata);
}

document.getElementById("loadBtn").addEventListener("click", loadFromServer);
```

Добавлены первые SQL-фильтры на стороне сервера:
```python
# Фильтр по году
year = request.args.get("year")
if year:
    cur.execute("SELECT ... FROM publications WHERE publication_year = %s", (year,))
```

---

## Этап 5 — Фильтры и улучшения интерфейса *(реконструкция)*
**~Декабрь 2025**

Добавлены фильтры по году, журналу и ключевым словам. Карта переработана:
теперь отображает несколько маркеров на одну статью (по всем аффилиациям),
а не один маркер по стране.

```javascript
// Было: один маркер по стране
const coord = countryCenters[m.affiliation_country.toLowerCase()];
if (coord) L.marker(coord).addTo(map);

// Стало: маркеры по координатам аффилиаций из БД
article.affiliations.forEach(aff => {
  if (aff.latitude && aff.longitude) {
    L.circleMarker([aff.latitude, aff.longitude], { radius: 6 })
      .bindPopup(`${aff.institution}<br>${article.title}`)
      .addTo(map);
  }
});
```

Добавлена тепловая карта через `leaflet.heat`:
```javascript
const heatPoints = articles
  .flatMap(a => (a.affiliations || [])
    .filter(af => af.latitude)
    .map(af => [af.latitude, af.longitude, 0.5])
  );
L.heatLayer(heatPoints, { radius: 25, blur: 15 }).addTo(map);
```

---

## Этап 6 — Оформление интерфейса и показ связей между статьями
**20 декабря 2025**

Две параллельных задачи: доработка визуального стиля и добавление связей между
статьями на графе на основе общих ключевых слов.

### Оформление интерфейса

Цветовая схема приведена к единому стилю — зелёная палитра, скруглённые карточки,
адаптивная сетка.

```css
:root {
  --accent:  #23613f;
  --panel:   #ffffff;
  --ink:     #122017;
  --muted:   #577166;
  --line:    #cfe0d6;
}

.app {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr) minmax(280px, 320px);
  height: 100vh;
  gap: 10px;
  padding: 10px;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  overflow: auto;
}

button {
  border: 1px solid #195235;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  padding: 9px 12px;
  font-size: 14px;
  cursor: pointer;
}

button.secondary {
  background: #f5fbf7;
  color: #1f4f35;
  border-color: #95bea8;
}

@media (max-width: 960px) {
  .app { grid-template-columns: 1fr; }
}
```

### Показ связей статей на графе

Связи строились по совпадению ключевых слов: если две статьи делят хотя бы одно
ключевое слово — между ними рисуется ребро.

```javascript
function buildAllConnections(articles) {
  const connections = [];
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i], b = articles[j];
      const keysA = new Set((a.keywords || []).map(k => k.toLowerCase()));
      const shared = (b.keywords || []).filter(k => keysA.has(k.toLowerCase()));
      if (shared.length > 0) {
        connections.push({ source: a.id, target: b.id, shared });
      }
    }
  }
  return connections;
}

// Отрисовка рёбер на D3-графе
function renderGraph(articles) {
  const connections = buildAllConnections(articles);

  const link = svg.append("g")
    .attr("stroke", "#9ab9a7")
    .attr("stroke-opacity", 0.5)
    .selectAll("line")
    .data(connections)
    .join("line")
    .attr("stroke-width", d => Math.min(d.shared.length, 4));

  // При наведении на ребро показываем общие ключевые слова
  link.append("title")
    .text(d => `Общие темы: ${d.shared.join(", ")}`);
}
```

Счётчик связей добавлен в панель статистики:
```javascript
function renderStats() {
  const connections = buildAllConnections(state.articles);
  el.dbCount.textContent    = String(state.databaseArticles.length);
  el.shownCount.textContent = String(state.articles.length);
  el.linksCount.textContent = String(connections.length);  // ← новое
}
```

> Позже (27.04.2026) этот вызов стал причиной зависания страницы — O(n²) на 10 000
> статьях. Счётчик убрали, показывают «—».

### Выделение связанных статей при клике

```javascript
function selectArticle(id) {
  state.selectedArticleId = id;
  const article = state.articles.find(a => a.id === id);
  const connections = buildAllConnections(state.articles);
  const related = connections
    .filter(c => c.source === id || c.target === id)
    .map(c => ({ id: c.source === id ? c.target : c.source, shared: c.shared }))
    .sort((a, b) => b.shared.length - a.shared.length);

  renderSelectedArticle(article);
  renderRelated(related);   // список похожих статей с общими ключевыми словами
  scheduleMapAndGraph();
}
```

---

## Этап 7 — Рефакторинг и переход к новой архитектуре *(реконструкция)*
**~Январь 2026**

Интерфейс переработан: карта и граф разнесены по вкладкам вместо трёх колонок.
Добавлена панель со списком статей и детальным просмотром.

```html
<!-- Было: три постоянных колонки -->
<div id="sidebar"> ... </div>
<svg id="graph"> ... </svg>
<div id="map"> ... </div>

<!-- Стало: режимы через кнопки -->
<div class="row">
  <button id="mapViewBtn">Карта</button>
  <button id="graphViewBtn">Граф</button>
</div>
<div id="mapView">...</div>
<div id="graphView" hidden>...</div>
```

Сервер получил отдельные эндпоинты для разных данных:
```
GET /api/articles    — список статей
GET /api/stats       — счётчики (статей, авторов, журналов)
GET /api/data-tables — все таблицы для отладки
```

---

## Этап 7 — Минимальный прототип для тестирования карты
**26 февраля 2026 · `Untitled-1.py`**

Простая статическая HTML-страница с Leaflet и 6 жёстко заданными точками —
проверка концепции карты без серверной части.

```javascript
const map = L.map('map').setView([50.0, 10.0], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const articles = [
  { latitude: 55.7558, longitude: 37.6173,
    title: 'Глубокое обучение в анализе геопространственных данных',
    authors: 'Иванов А.А., Петров В.И.' },
  { latitude: 51.5074, longitude: -0.1278,
    title: 'Семантическая сегментация городских сцен',
    authors: 'Smith J., Brown T.' },
  // ...ещё 4 статьи
];

for (const a of articles) {
  L.marker([a.latitude, a.longitude])
    .addTo(map)
    .bindPopup(`<b>${a.title}</b><br>${a.authors}`);
}
```

---

## Этап 8 — Пузырьковая карта: размер = число статей
**5 марта 2026**

Leaflet-карта с `circleMarker` — размер пузыря пропорционален числу статей из
этого города. Добавлены подписи городов и легенда.

```javascript
function radiusByCount(count) {
  return 6 + Math.sqrt(count) * 7;  // sqrt сглаживает рост
}

locations.forEach(loc => {
  L.circleMarker([loc.lat, loc.lng], {
    radius:      radiusByCount(loc.articles.length),
    fillColor:   "#7b2cff",
    fillOpacity: 0.60,
    color:       "#2f6fdf",
    weight:      2,
  })
  .bindPopup(`
    <b>${loc.city}, ${loc.country}</b><br>
    Статей: <b>${loc.articles.length}</b><br>
    ${loc.articles.map(a => `• ${a.title} (${a.year})`).join("<br>")}
  `)
  .addTo(map);

  // Подпись города
  L.marker([loc.lat, loc.lng], {
    icon: L.divIcon({ html: `<div class="city-label">${loc.city}</div>`, iconSize: [0, 0] }),
    interactive: false
  }).addTo(map);
});
```

---

## Этап 9 — Полноценный интерфейс с OpenAlex API, тепловой картой и D3-графом
**15 апреля 2026 · `VKR.html`**

Переход от статических данных к живым запросам OpenAlex API. Трёхколоночный
макет, тепловая карта через `leaflet.heat`, D3-граф, справочник журналов
с автодополнением, семантический поиск через эмбеддинги.

```javascript
async function loadWorks(filters) {
  const filterParts = [];
  if (filters.sourceIds.length)
    filterParts.push(`primary_location.source.id:${filters.sourceIds.join("|")}`);
  if (filters.authorIds.length)
    filterParts.push(`authorships.author.id:${filters.authorIds.join("|")}`);
  if (filters.terms)
    filterParts.push(`title.search:${filters.terms}`);

  let cursor = "*";
  const works = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({ "per-page": PER_PAGE, cursor });
    if (filterParts.length) params.set("filter", filterParts.join(","));
    if (filters.embedding)  params.set("search", filters.embedding);
    const data = await fetchJson(`${OPENALEX_API}/works?${params}`);
    if (!data.results?.length) break;
    works.push(...data.results);
    cursor = data.meta?.next_cursor;
    if (!cursor) break;
  }
  return works;
}

// Тепловая карта из координат аффилиаций
function extractHeatPoints(works) {
  const counts = new Map();
  for (const work of works)
    for (const auth of work.authorships || [])
      for (const inst of auth.institutions || []) {
        const { latitude: lat, longitude: lon } = inst.geo || {};
        if (lat == null) continue;
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
  const max = Math.max(1, ...counts.values());
  return [...counts.entries()].map(([k, n]) => [...k.split(",").map(Number), n / max]);
}
```

Справочник 50+ журналов с автодополнением по названию и ISSN:
```javascript
const PRELOADED_JOURNALS = [
  { title: "Nature",   sourceIds: ["S137773608"], issns: ["0028-0836"] },
  { title: "Science",  sourceIds: ["S3880285"],   issns: ["0036-8075"] },
  // ...
];
```

---

## Этап 10 — Пакетная загрузка данных из OpenAlex в JSON
**23 апреля 2026 · `import.py`**

Скрипт для загрузки статей из OpenAlex API и сохранения в `article_data.json`
с группировкой по журналам.

```python
def load_articles():
    articles = []
    cursor = "*"
    for page in range(1, MAX_PAGES + 1):
        data = fetch_json(f"{BASE_URL}/works?per-page={PER_PAGE}&cursor={cursor}")
        results = data.get("results", [])
        if not results:
            break
        articles.extend(results)
        cursor = data.get("meta", {}).get("next_cursor")
        if not cursor:
            break
    return articles

# Группировка по журналам → article_data.json
grouped = defaultdict(list)
for article in articles:
    journal = article.get("primary_location", {}).get("source", {}).get("display_name", "Без журнала")
    grouped[journal].append(article)

JSON_OUTPUT_FILE.write_text(
    json.dumps([{"journal": j, "articles": a} for j, a in grouped.items()], ensure_ascii=False),
    encoding="utf-8"
)
```

При ошибке сети используется ранее сохранённый кэш:
```python
def handle_cached_fallback(error_message):
    grouped = load_cached_grouped_articles()  # читает article_data.json
    if not grouped:
        raise RuntimeError(error_message)
    print("Используется кэш:", JSON_OUTPUT_FILE)
```

---

## Этап 11 — Финализация схемы PostgreSQL и сервер
**27 апреля 2026, утро · `db.sql`, `setup_pg_database.py`, `openalex_server.py`**

Схема из Этапа 2 доведена до финального вида: 7 таблиц, индексы, каскадное удаление.

```sql
CREATE TABLE affiliations (
    affiliation_id  SERIAL PRIMARY KEY,
    person_id       INTEGER REFERENCES persons(person_id) ON DELETE CASCADE,
    institution_id  TEXT,
    institution     TEXT NOT NULL,
    country         VARCHAR(100),
    latitude        DOUBLE PRECISION,   -- заполнится на следующих этапах
    longitude       DOUBLE PRECISION
);
```

```python
# setup_pg_database.py — просто применяет db.sql
def setup():
    sql = Path("db.sql").read_text(encoding="utf-8")
    conn = psycopg2.connect(**PG_CONFIG)
    with conn:
        conn.cursor().execute(sql)
    print("Схема применена.")
```

---

## Этап 12 — Загрузка 9 994 статей в PostgreSQL (MemoryError + DOI-коллизия)
**27 апреля 2026, 19:32 · `build_separate_databases.py`**

### Проблема A — MemoryError на 202 МБ JSON

**Было:**
```python
data = json.loads(JSON_PATH.read_text(encoding="utf-8"))  # MemoryError
```

**Стало:**
```python
with JSON_PATH.open("rb") as f:
    for group in ijson.items(f, "item"):        # один объект за раз
        for article in group.get("articles") or []:
            ...
```

### Проблема B — UniqueViolation при конфликте DOI

Два разных OpenAlex-объекта ссылались на один DOI — транзакция падала.

**Стало:**
```python
cur.execute("SAVEPOINT pub_save")
try:
    cur.execute("INSERT ... ON CONFLICT (openalex_id) DO UPDATE ... RETURNING publication_id", ...)
    pub_id = cur.fetchone()[0]
    cur.execute("RELEASE SAVEPOINT pub_save")
    return pub_id
except Exception:
    cur.execute("ROLLBACK TO SAVEPOINT pub_save")
    # поиск по openalex_id → по doi → вставка без doi
```

**Результат:** все 9 994 статьи загружены в PostgreSQL.

---

## Этап 13 — Новый интерфейс VKR1.html и удаление кнопок
**27 апреля 2026, 19:54 · `VKR1.html`**

Создан `VKR1.html` на базе Plotly (вместо Leaflet) с IndexedDB-кэшем.
Две кнопки загрузки, которые вешали UI, удалены:

**Было:**
```html
<button id="folderDataBtn">Загрузить openalex_data</button>
<button id="serverDataBtn">Загрузить из PostgreSQL</button>
```

**Стало:** кнопки удалены, загрузка из PostgreSQL происходит автоматически при
старте приложения в фоне.

---

## Этап 14 — Устранение зависаний в vkr1_app.js
**27 апреля 2026, 21:01 · `vkr1_app.js`**

Четыре отдельные причины зависания страницы.

### Исправление 1 — IndexedDB при старте (блокировка UI)

**Было:**
```javascript
async function init() {
  await refreshDatabaseArticles();  // читала 10 000 записей из IndexedDB
  renderAll();
  renderMap();    // синхронно
  renderGraph();  // синхронно
}
```

**Стало:**
```javascript
async function init() {
  state.articles = DEMO_ARTICLES.slice();  // сразу показываем демо
  renderAll();
  scheduleMapAndGraph();                   // через requestAnimationFrame
  fetchLocalJson("/api/articles")          // сервер — в фоне
    .then(articles => { state.databaseArticles = articles; showAllArticlesAndRender(); });
}
```

### Исправление 2 — O(n²) в `buildAllConnections`

**Было:**
```javascript
function renderStats() {
  const connections = buildAllConnections(state.articles); // 50 млн операций для 10к статей
  el.linksCount.textContent = String(connections.length);
}
```

**Стало:**
```javascript
function renderStats() {
  el.linksCount.textContent = "—";  // убрали вызов
}
```

### Исправление 3 — `flatMap` создавал 54 000-элементный массив

**Было:**
```javascript
const allAuthors = source.flatMap(a => a.authors || []);
```

**Стало:**
```javascript
function* iterField(source, getter) {
  for (const article of source) yield* getter(article);
}
// использование:
iterField(source, a => a.authors || [])  // ленивый генератор
```

### Исправление 4 — `requestAnimationFrame` для карты и графа

**Было:**
```javascript
function renderAll() {
  renderStats();
  renderMap();    // блокировало UI
  renderGraph();  // блокировало UI
}
```

**Стало:**
```javascript
function scheduleMapAndGraph() {
  requestAnimationFrame(() => { renderMap(); renderGraph(); });
}
function renderAll() {
  renderStats();
  populateEntityFilters(state.articles);
  renderArticleList(state.articles);
  // карта и граф — в следующем кадре
}
```

### Дополнительно
- Список статей ограничен 200 записями
- Абстракт загружается по запросу через `/api/article/<id>`, а не хранится для всех статей сразу

---

## Этап 15 — Геокодирование через OpenAlex API
**27 апреля 2026, 21:27 · `fetch_geo.py` (новый файл)**

После загрузки данных 0% статей имели координаты — `geo` в JSON не был заполнен.
Скрипт запрашивает координаты учреждений батчами по 100.

```python
def fetch_batch(ids):
    filter_str = "|".join(ids)
    url = (f"https://api.openalex.org/institutions"
           f"?filter=ids.openalex:{filter_str}&select=id,geo&per_page={len(ids)}")
    with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as resp:
        data = json.load(resp)
    return {
        item["id"].replace("https://openalex.org/", ""): {
            "lat": (item.get("geo") or {}).get("latitude"),
            "lon": (item.get("geo") or {}).get("longitude"),
        }
        for item in data.get("results") or []
    }
```

**Результат:** 53 039 строк обновлены, **7 822 / 9 994 статей (78%)** с координатами.

---

## Этап 16 — Оптимизация API-сервера
**27 апреля 2026, 21:30 · `openalex_server.py`**

### Убраны abstract и doi из общего списка статей

**Было:** каждая из 9 994 статей несла полный текст абстракта в общем ответе.

**Стало:** abstract и doi убраны из `/api/articles`, выдаются только через `/api/article/<id>`.

```python
def load_article_detail(article_id):
    rows = read_rows(cur,
        "SELECT p.abstract, p.doi FROM publications p "
        "WHERE p.openalex_id = %s OR CAST(p.publication_id AS TEXT) = %s LIMIT 1",
        (article_id, article_id))
    return {"id": article_id, "abstractText": rows[0]["abstract"] or "", "doi": rows[0]["doi"] or ""}
```

### Фильтр аффилиаций без координат + лимит 5 на статью

```sql
-- Было:
SELECT DISTINCT pa.publication_id, a.institution, a.latitude, a.longitude
FROM affiliations a JOIN publication_authors pa ON pa.person_id = a.person_id

-- Стало:
SELECT DISTINCT pa.publication_id, a.institution, a.latitude, a.longitude
FROM affiliations a JOIN publication_authors pa ON pa.person_id = a.person_id
WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL
```

```python
for item in affiliations_by_pub.get(pub_id, []):
    if len(article_affiliations) >= 5:
        break
```

---

## Этап 17 — Геокодирование оставшихся 22% через Photon
**28 апреля 2026, 06:52 · `fetch_geo_nominatim.py` (новый файл)**

У 2 172 статей не было `institution_id` — только сырые строки аффилиаций.
Написан скрипт с прогрессивным сокращением запроса (полная строка → 3 части →
2 части → 1 слово).

Nominatim заблокировал IP с HTTP 403 после предыдущих прогонов. Переключились на
**Photon** (photon.komoot.io). Особенность: координаты в GeoJSON-порядке `[lon, lat]`.

```python
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # cp1251 → utf-8

def nominatim_search(query):
    parts = [p.strip() for p in query.split(",") if p.strip()]
    candidates = [query, ", ".join(parts[-3:]), ", ".join(parts[-2:]), parts[0]]

    for candidate in candidates:
        url = f"https://photon.komoot.io/api/?{urlencode({'q': candidate, 'limit': '1'})}"
        with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=15) as resp:
            data = json.load(resp)
        features = data.get("features") or []
        if features:
            coords = features[0]["geometry"]["coordinates"]
            return float(coords[1]), float(coords[0]), candidate  # [lon, lat] → lat, lon
        time.sleep(0.3)
    return None, None, None
```

Строки отбирались по числу статей, которые они «разблокируют»:
```sql
SELECT a.institution, COUNT(DISTINCT pa.publication_id) AS pub_count
FROM affiliations a JOIN publication_authors pa ON pa.person_id = a.person_id
WHERE a.institution_id IS NULL AND a.latitude IS NULL
  AND pa.publication_id IN (
      -- статьи без единой координаты
      SELECT p.publication_id FROM publications p
      WHERE NOT EXISTS (
          SELECT 1 FROM publication_authors pa2
          JOIN affiliations a2 ON a2.person_id = pa2.person_id
          WHERE pa2.publication_id = p.publication_id AND a2.latitude IS NOT NULL
      )
  )
GROUP BY a.institution
ORDER BY pub_count DESC
```

**Результат:** геокодировано 229/257 строк, обновлено 410 строк,
итоговое покрытие **8 077 / 9 994 статей (80,8%)**.

---

## Итоговая таблица

| Дата | Файл / действие | Что сделано | Результат |
|---|---|---|---|
| 28.09.2025 | HTML + JS | D3 force-граф, Leaflet-карта по стране, загрузка JSON | Первый рабочий интерфейс |
| 29.09.2025 | `pg_config.py`, `db.sql`, сервер | Миграция SQLite → PostgreSQL, кодировка, MemoryError (не решён) | PostgreSQL работает |
| ~Окт 2025 | `build_separate_databases.py` | `ijson` — первая успешная загрузка данных | БД наполнена |
| ~Ноя 2025 | `openalex_server.py` | Интерфейс подключён к серверу вместо локального JSON | Живые данные |
| ~Дек 2025 | HTML + JS | Фильтры, маркеры по координатам аффилиаций, тепловая карта | Полноценные фильтры |
| 20.12.2025 | HTML + JS + CSS | Единый стиль (зелёная палитра, карточки), связи статей по ключевым словам | Красивый интерфейс, граф связей |
| ~Янв 2026 | HTML + JS | Вкладки карта/граф, список статей, новые эндпоинты сервера | Новая архитектура |
| 26.02.2026 | `Untitled-1.py` | Минимальный прототип: Leaflet + 6 жёстких точек | Тест концепции |
| 05.03.2026 | HTML | Пузырьковая карта: размер = число статей, подписи, легенда | Визуализация масштаба |
| 15.04.2026 | `VKR.html` | OpenAlex API, тепловая карта, D3-граф, 50+ журналов | Полный функционал |
| 23.04.2026 | `import.py` | Пакетная загрузка статей → `article_data.json` | Локальный кэш |
| 27.04 утро | `db.sql`, `setup_pg_database.py` | Финальная схема PostgreSQL (7 таблиц) | БД готова |
| 27.04 19:32 | `build_separate_databases.py` | `ijson` + `SAVEPOINT` — 9 994 статей без ошибок | Данные загружены |
| 27.04 19:54 | `VKR1.html` | Plotly-интерфейс, удалены кнопки-вешалки | UI не зависает |
| 27.04 21:01 | `vkr1_app.js` | IndexedDB, O(n²), flatMap, sync-рендер — устранены | Страница быстрая |
| 27.04 21:27 | `fetch_geo.py` (новый) | Батч-запросы к OpenAlex API | 7 822 / 9 994 (78%) с гео |
| 27.04 21:30 | `openalex_server.py` | Убраны abstract/doi + `/api/article/<id>` | Лёгкий ответ API |
| 28.04 06:52 | `fetch_geo_nominatim.py` (новый) | Photon-геокодирование сырых строк | 8 077 / 9 994 (80,8%) с гео |
