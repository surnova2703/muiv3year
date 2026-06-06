const DB_NAME = "vkr_articles_database";
const DB_VERSION = 1;
const ARTICLE_STORE = "articles";
const OPENALEX_API = "https://api.openalex.org";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_PAGES = 3;
const PER_PAGE = 100;

const DEMO_ARTICLES = [
  {
    id: "W2194775991",
    title: "Mapping the structure of science",
    year: 2009,
    journal: "Scientometrics",
    authors: ["Kevin W. Boyack", "Richard Klavans"],
    topics: ["scientometrics", "bibliometrics", "science mapping"],
    keywords: ["co-citation", "journal clustering", "knowledge structure"],
    affiliations: [{ place: "SciTech Strategies, Albuquerque, USA", lat: 35.0844, lon: -106.6504 }],
    abstractText: "Предложен подход к картированию структуры науки на основе совместного цитирования журналов."
  },
  {
    id: "W2911964244",
    title: "Bibliometric methods in management and organization",
    year: 2013,
    journal: "Organizational Research Methods",
    authors: ["Anne-Wil Harzing", "Satu Alakangas"],
    topics: ["bibliometrics", "research evaluation", "citation analysis"],
    keywords: ["h-index", "citation counts", "publication output"],
    affiliations: [{ place: "Middlesex University, London, UK", lat: 51.5897, lon: -0.2277 }],
    abstractText: "Описаны библиометрические методы оценки исследовательской продуктивности."
  },
  {
    id: "W1979290264",
    title: "Using thematic analysis in psychology",
    year: 2006,
    journal: "Qualitative Research in Psychology",
    authors: ["Virginia Braun", "Victoria Clarke"],
    topics: ["psychology", "qualitative methods", "thematic analysis"],
    keywords: ["coding", "themes", "qualitative research"],
    affiliations: [
      { place: "University of Auckland, New Zealand", lat: -36.8485, lon: 174.7633 },
      { place: "University of the West of England, Bristol, UK", lat: 51.4545, lon: -2.5879 }
    ],
    abstractText: "Работа описывает тематический анализ как гибкий метод анализа качественных данных."
  },
  {
    id: "W3128646645",
    title: "Global Cancer Statistics 2020",
    year: 2021,
    journal: "CA: A Cancer Journal for Clinicians",
    authors: ["Hyuna Sung", "Jacques Ferlay", "Rebecca Siegel"],
    topics: ["cancer", "epidemiology", "global health"],
    keywords: ["incidence", "mortality", "oncology"],
    affiliations: [
      { place: "American Cancer Society, Atlanta, USA", lat: 33.7490, lon: -84.3880 },
      { place: "IARC, Lyon, France", lat: 45.7640, lon: 4.8357 }
    ],
    abstractText: "Сводка глобальных показателей заболеваемости и смертности от онкологических заболеваний."
  },
  {
    id: "W1981368803",
    title: "Generalized Gradient Approximation Made Simple",
    year: 1996,
    journal: "Physical Review Letters",
    authors: ["John P. Perdew", "Kieron Burke", "Matthias Ernzerhof"],
    topics: ["physics", "density functional theory", "materials science"],
    keywords: ["gga", "dft", "electronic structure"],
    affiliations: [{ place: "Tulane University, New Orleans, USA", lat: 29.9407, lon: -90.1200 }],
    abstractText: "Предложена широко используемая аппроксимация GGA для расчётов в теории функционала плотности."
  }
];

const state = {
  db: null,
  databaseArticles: [],
  articles: [],
  selectedArticleId: null,
  currentMode: "map",
  filters: {
    year: "",
    journal: "",
    author: "",
    affiliation: ""
  }
};

const el = {
  status: document.getElementById("status"),
  fileInput: document.getElementById("fileInput"),
  importBtn: document.getElementById("importBtn"),
  exportDbBtn: document.getElementById("exportDbBtn"),
  demoDbBtn: document.getElementById("demoDbBtn"),
  clearDbBtn: document.getElementById("clearDbBtn"),

  mapViewBtn: document.getElementById("mapViewBtn"),
  graphViewBtn: document.getElementById("graphViewBtn"),
  mapView: document.getElementById("mapView"),
  graphView: document.getElementById("graphView"),
  mapPlot: document.getElementById("mapPlot"),
  graphSvg: document.getElementById("graphSvg"),
  graphModeSelect: document.getElementById("graphModeSelect"),
  filterYearSelect: document.getElementById("filterYearSelect"),
  filterJournalSelect: document.getElementById("filterJournalSelect"),
  filterAuthorSelect: document.getElementById("filterAuthorSelect"),
  filterAffiliationSelect: document.getElementById("filterAffiliationSelect"),
  articleList: document.getElementById("articleList"),
  selectedArticleSection: document.getElementById("selectedArticleSection"),
  selectedArticleBox: document.getElementById("selectedArticleBox"),
  rankedRelatedBox: document.getElementById("rankedRelatedBox"),
  graphDetails: document.getElementById("graphDetails"),
  rawMeta: document.getElementById("rawMeta"),
  rawData: document.getElementById("rawData"),
  processedMeta: document.getElementById("processedMeta"),
  processedData: document.getElementById("processedData"),
  downloadAnalysisBtn: document.getElementById("downloadAnalysisBtn"),
  dbCount: document.getElementById("dbCount"),
  shownCount: document.getElementById("shownCount"),
  geoCount: document.getElementById("geoCount"),
  linksCount: document.getElementById("linksCount"),
  dbViewBtn: document.getElementById("dbViewBtn"),
  dbCloseBtn: document.getElementById("dbCloseBtn"),
  dbView: document.getElementById("dbView")
};

function setStatus(text) {
  el.status.textContent = text;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ARTICLE_STORE)) {
        const store = db.createObjectStore(ARTICLE_STORE, { keyPath: "id" });
        store.createIndex("year", "year", { unique: false });
        store.createIndex("journal", "journal", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllArticlesFromDb() {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(ARTICLE_STORE, "readonly");
    const request = tx.objectStore(ARTICLE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveArticlesToDb(articles) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(ARTICLE_STORE, "readwrite");
    const store = tx.objectStore(ARTICLE_STORE);
    articles.forEach((article) => store.put(article));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function clearDatabase() {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(ARTICLE_STORE, "readwrite");
    tx.objectStore(ARTICLE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function refreshDatabaseArticles() {
  state.databaseArticles = await readAllArticlesFromDb();
  state.databaseArticles.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  el.dbCount.textContent = String(state.databaseArticles.length);
}

function splitTokens(raw) {
  return String(raw || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item.trim();
      return item && (item.display_name || item.name || item.title || item.id)
        ? String(item.display_name || item.name || item.title || item.id).trim()
        : "";
    }).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function uniq(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (err) {
    return JSON.stringify({ error: err.message }, null, 2);
  }
}

function shortId(raw) {
  return String(raw || "").replace("https://openalex.org/", "");
}

function makeLocalId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decodeAbstractInvertedIndex(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  Object.keys(index).forEach((token) => {
    const positions = Array.isArray(index[token]) ? index[token] : [];
    positions.forEach((position) => {
      words[position] = token;
    });
  });
  return words.filter(Boolean).join(" ");
}

function normalizeAffiliations(value, work) {
  const result = [];
  const seen = new Set();

  function addPoint(place, lat, lon) {
    const hasLat = lat !== null && lat !== undefined && String(lat).trim() !== "";
    const hasLon = lon !== null && lon !== undefined && String(lon).trim() !== "";
    const latitude = Number(lat);
    const longitude = Number(lon);
    const hasCoords = hasLat && hasLon && Number.isFinite(latitude) && Number.isFinite(longitude);
    const label = String(place || "Неизвестная аффилиация").trim();
    const key = `${label}|${hasCoords ? latitude : ""}|${hasCoords ? longitude : ""}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    result.push({ place: label, lat: hasCoords ? latitude : null, lon: hasCoords ? longitude : null });
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (!item) return;
      addPoint(
        item.place || item.display_name || item.name || item.institution,
        item.lat ?? item.latitude,
        item.lon ?? item.lng ?? item.longitude
      );
    });
  }

  const authorships = Array.isArray(work && work.authorships) ? work.authorships : [];
  authorships.forEach((authorship) => {
    const institutions = Array.isArray(authorship.institutions) ? authorship.institutions : [];
    institutions.forEach((inst) => {
      const geo = inst.geo || {};
      addPoint(inst.display_name, geo.latitude, geo.longitude);
    });
    const rawAffiliations = Array.isArray(authorship.raw_affiliation_strings) ? authorship.raw_affiliation_strings : [];
    rawAffiliations.forEach((raw) => addPoint(raw, null, null));
  });

  if (work && (work.place || work.lat || work.lon)) {
    addPoint(work.place || work.affiliation || work.institution, work.lat ?? work.latitude, work.lon ?? work.lng ?? work.longitude);
  }

  return result;
}

function normalizeArticle(raw, fallbackJournal = "") {
  const id = shortId(raw.id || raw.openalex || raw.openalex_id || raw.doi || raw.title || makeLocalId());
  const title = raw.title || raw.display_name || raw.name || "Без названия";
  const primaryLocation = raw.primary_location || {};
  const source = primaryLocation.source || {};
  const journal = raw.journal || raw.source || source.display_name || primaryLocation.raw_source_name || fallbackJournal || "Без журнала";
  const authorships = Array.isArray(raw.authorships) ? raw.authorships : [];
  const authors = raw.authors
    ? normalizeArray(raw.authors)
    : authorships.map((item) => item.author && item.author.display_name).filter(Boolean);
  const topics = raw.topics ? normalizeArray(raw.topics) : normalizeArray(raw.primary_topic ? [raw.primary_topic] : []);
  const keywords = normalizeArray(raw.keywords || raw.concepts);
  const affiliations = normalizeAffiliations(raw.affiliations || raw.points, raw);

  return {
    id,
    title: String(title),
    year: Number(raw.year || raw.publication_year || raw.publicationYear) || null,
    journal: String(journal || "Без журнала"),
    authors: uniq(authors),
    topics: uniq(topics),
    keywords: uniq(keywords),
    affiliations,
    abstractText: String(raw.abstractText || raw.abstract || decodeAbstractInvertedIndex(raw.abstract_inverted_index) || ""),
    doi: raw.doi || "",
    importedAt: new Date().toISOString()
  };
}

function flattenJsonPayload(payload) {
  if (Array.isArray(payload)) {
    if (payload.every((item) => item && Array.isArray(item.articles))) {
      return payload.flatMap((group) => group.articles.map((article) => ({ article, journal: group.journal })));
    }
    return payload.map((article) => ({ article, journal: "" }));
  }
  if (payload && Array.isArray(payload.results)) {
    return payload.results.map((article) => ({ article, journal: "" }));
  }
  if (payload && Array.isArray(payload.articles)) {
    return payload.articles.map((article) => ({ article, journal: payload.journal || "" }));
  }
  if (payload && typeof payload === "object") {
    return [{ article: payload, journal: "" }];
  }
  return [];
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeText(header));
  const articlesById = new Map();
  rows.slice(1).forEach((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    const id = record.id || record.openalex || record.doi || record.title || makeLocalId();
    const existing = articlesById.get(id) || {
      id,
      title: record.title || record.display_name || "Без названия",
      year: Number(record.year || record.publication_year) || null,
      journal: record.journal || record.source || "Без журнала",
      authors: normalizeArray(record.authors || record.author),
      topics: normalizeArray(record.topics || record.topic),
      keywords: normalizeArray(record.keywords || record.keyword),
      affiliations: [],
      abstractText: record.abstract || record.abstracttext || "",
      importedAt: new Date().toISOString()
    };
    const place = record.place || record.affiliation || record.institution || record.organization;
    if (place) {
      const lat = record.lat || record.latitude;
      const lon = record.lon || record.lng || record.longitude;
      existing.affiliations.push({
        place,
        lat: lat === "" ? null : Number(lat),
        lon: lon === "" ? null : Number(lon)
      });
    }
    articlesById.set(id, existing);
  });
  return Array.from(articlesById.values());
}

async function parseFile(file) {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".csv")) {
    return { raw: text.slice(0, 2000), articles: parseCsv(text) };
  }
  const payload = JSON.parse(text);
  const entries = flattenJsonPayload(payload);
  return {
    raw: Array.isArray(payload) ? payload.slice(0, 3) : payload,
    articles: entries.map((entry) => normalizeArticle(entry.article, entry.journal))
  };
}

function mergeImportedArticles(articles) {
  const merged = new Map();
  articles.forEach((article) => {
    const current = merged.get(article.id);
    if (!current) {
      merged.set(article.id, article);
      return;
    }
    current.authors = uniq(current.authors.concat(article.authors));
    current.topics = uniq(current.topics.concat(article.topics));
    current.keywords = uniq(current.keywords.concat(article.keywords));
    current.affiliations = normalizeAffiliations(current.affiliations.concat(article.affiliations), {});
    current.abstractText = current.abstractText || article.abstractText;
  });
  return Array.from(merged.values());
}

async function fetchLocalJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: HTTP ${response.status}`);
  }
  return response.json();
}

function normalizePreparedOpenAlexData(payload) {
  const publications = payload.publications || [];
  const personsById = new Map((payload.persons || []).map((person) => [person.id, person]));
  const authorsByPublication = new Map();
  const affiliationsByPublication = new Map();
  const topicsByPublication = new Map();
  const keywordsByPublication = new Map();

  (payload.personPublications || []).forEach((link) => {
    const person = personsById.get(link.person_id);
    if (!person) return;
    const list = authorsByPublication.get(link.publication_id) || [];
    list.push({
      name: person.display_name,
      order: Number(link.sort_order || 0)
    });
    authorsByPublication.set(link.publication_id, list);
  });

  (payload.affiliations || []).forEach((affiliation) => {
    const list = affiliationsByPublication.get(affiliation.publication_id) || [];
    list.push({
      place: affiliation.institution_name || affiliation.raw_affiliation || "Неизвестная аффилиация",
      lat: affiliation.latitude === null || affiliation.latitude === "" ? null : Number(affiliation.latitude),
      lon: affiliation.longitude === null || affiliation.longitude === "" ? null : Number(affiliation.longitude)
    });
    affiliationsByPublication.set(affiliation.publication_id, list);
  });

  (payload.publicationTopics || []).forEach((topic) => {
    const list = topicsByPublication.get(topic.publication_id) || [];
    if (topic.topic_name) list.push(topic.topic_name);
    topicsByPublication.set(topic.publication_id, list);
  });

  (payload.publicationKeywords || []).forEach((keyword) => {
    const list = keywordsByPublication.get(keyword.publication_id) || [];
    if (keyword.keyword_name) list.push(keyword.keyword_name);
    keywordsByPublication.set(keyword.publication_id, list);
  });

  return publications.map((publication) => {
    const authors = (authorsByPublication.get(publication.id) || [])
      .sort((a, b) => a.order - b.order)
      .map((item) => item.name);

    return {
      id: publication.id,
      title: publication.title || publication.display_name || "Без названия",
      year: Number(publication.publication_year) || null,
      journal: publication.journal_name || "Без журнала",
      authors: uniq(authors),
      topics: uniq(topicsByPublication.get(publication.id) || []),
      keywords: uniq(keywordsByPublication.get(publication.id) || []),
      affiliations: normalizeAffiliations(affiliationsByPublication.get(publication.id) || [], {}),
      abstractText: publication.abstract_text || "",
      doi: publication.doi || "",
      importedAt: new Date().toISOString()
    };
  });
}

async function loadOpenAlexFolderData() {
  setButtonsDisabled(true);
  try {
    setStatus("Загрузка подготовленных файлов из папки openalex_data...");
    const [
      publications,
      persons,
      personPublications,
      affiliations,
      publicationTopics,
      publicationKeywords
    ] = await Promise.all([
      fetchLocalJson("openalex_data/publications.json"),
      fetchLocalJson("openalex_data/persons.json"),
      fetchLocalJson("openalex_data/person_publications.json"),
      fetchLocalJson("openalex_data/affiliations.json"),
      fetchLocalJson("openalex_data/publication_topics.json"),
      fetchLocalJson("openalex_data/publication_keywords.json")
    ]);

    const articles = normalizePreparedOpenAlexData({
      publications,
      persons,
      personPublications,
      affiliations,
      publicationTopics,
      publicationKeywords
    });
    await saveArticlesToDb(articles);
    await refreshDatabaseArticles();
    setRawAnalysis("Загружены подготовленные JSON-файлы из openalex_data.", {
      publications: publications.length,
      persons: persons.length,
      personPublications: personPublications.length,
      affiliations: affiliations.length,
      publicationTopics: publicationTopics.length,
      publicationKeywords: publicationKeywords.length
    });
    setProcessedAnalysis(`В браузерную базу добавлено или обновлено статей: ${articles.length}.`, buildProcessedPreviewPayload(articles));
    showAllArticlesAndRender();
    setStatus(`Данные из openalex_data загружены.\nСтатей: ${articles.length}.\nВсего статей в браузерной базе: ${state.databaseArticles.length}.`);
  } catch (err) {
    setStatus(
      `Ошибка загрузки openalex_data: ${err.message}\n` +
      "Откройте страницу через локальный сервер: python openalex_server.py"
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function loadServersqlprojData() {
  setButtonsDisabled(true);
  try {
    setStatus("Загрузка данных из PostgreSQL через локальный сервер...");
    const articles = await fetchLocalJson("/api/articles");
    await saveArticlesToDb(articles);
    await refreshDatabaseArticles();
    setRawAnalysis("Данные получены через API локального сервера из PostgreSQL.", { endpoint: "/api/articles", articles: articles.length });
    setProcessedAnalysis(`В браузерную базу добавлено или обновлено статей: ${articles.length}.`, buildProcessedPreviewPayload(articles));
    showAllArticlesAndRender();
    setStatus(`Данные из PostgreSQL загружены.\nСтатей: ${articles.length}.\nВсего статей в браузерной базе: ${state.databaseArticles.length}.`);
  } catch (err) {
    setStatus(
      `Ошибка загрузки через сервер: ${err.message}\n` +
      "Запустите сервер командой: python openalex_server.py"
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function importSelectedFiles() {
  const files = Array.from(el.fileInput.files || []);
  if (!files.length) {
    setStatus("Выберите JSON или CSV файл для загрузки в базу.");
    return;
  }

  setButtonsDisabled(true);
  try {
    const allArticles = [];
    const rawPreview = [];
    for (const file of files) {
      const parsed = await parseFile(file);
      rawPreview.push({ file: file.name, preview: parsed.raw });
      allArticles.push(...parsed.articles);
    }
    const normalized = mergeImportedArticles(allArticles).filter((article) => article.id && article.title);
    await saveArticlesToDb(normalized);
    await refreshDatabaseArticles();
    setRawAnalysis(`Импортировано файлов: ${files.length}. Найдено записей: ${allArticles.length}.`, rawPreview);
    setProcessedAnalysis(`В базу добавлено или обновлено статей: ${normalized.length}.`, buildProcessedPreviewPayload(normalized));
    showAllArticlesAndRender();
    setStatus(`Файлы загружены в базу.\nДобавлено или обновлено статей: ${normalized.length}.\nВсего статей в базе: ${state.databaseArticles.length}.`);
  } catch (err) {
    setStatus(`Ошибка импорта: ${err.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

function countArticlesWithGeo(articles) {
  return articles.filter((article) => (article.affiliations || []).some((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))).length;
}

function getMapPoints(articles) {
  const points = [];
  articles.forEach((article) => {
    (article.affiliations || []).forEach((point) => {
      if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        points.push({ article, point });
      }
    });
  });
  return points;
}

function buildProcessedPreviewPayload(articles) {
  return {
    articlesCount: articles.length,
    withCoordinates: countArticlesWithGeo(articles),
    withoutCoordinates: articles.length - countArticlesWithGeo(articles),
    sample: articles.slice(0, 3)
  };
}

function showAllArticlesAndRender() {
  readEntityFilters();
  populateEntityFilters();
  const source = getCurrentSourceArticles();
  state.articles = source.filter(articleMatchesFilters);
  if (!state.articles.some((article) => article.id === state.selectedArticleId)) {
    state.selectedArticleId = null;
  }
  setProcessedAnalysis(`После фильтрации показано статей: ${state.articles.length}.`, {
    filters: describeActiveFilters(),
    preview: buildProcessedPreviewPayload(state.articles)
  });
  renderAll();
  scheduleMapAndGraph();
  setStatus(
    `Построено по источнику: ${state.databaseArticles.length ? "локальная база" : "демо-набор"}.\n` +
    `Фильтр: ${describeActiveFilters()}.\n` +
    `Статей на экране: ${state.articles.length}.\n` +
    `Статей с координатами: ${countArticlesWithGeo(state.articles)}.`
  );
}

async function tryLoadServersqlprojData() {
  const articles = await fetchLocalJson("/api/articles");
  await saveArticlesToDb(articles);
  await refreshDatabaseArticles();
  setRawAnalysis("Данные автоматически получены через API локального сервера из PostgreSQL.", { endpoint: "/api/articles", articles: articles.length });
  setProcessedAnalysis(`В браузерную базу добавлено или обновлено статей: ${articles.length}.`, buildProcessedPreviewPayload(articles));
  return {
    source: "PostgreSQL через локальный сервер",
    articlesCount: articles.length
  };
}

async function tryLoadOpenAlexFolderData() {
  const [
    publications,
    persons,
    personPublications,
    affiliations,
    publicationTopics,
    publicationKeywords
  ] = await Promise.all([
    fetchLocalJson("openalex_data/publications.json"),
    fetchLocalJson("openalex_data/persons.json"),
    fetchLocalJson("openalex_data/person_publications.json"),
    fetchLocalJson("openalex_data/affiliations.json"),
    fetchLocalJson("openalex_data/publication_topics.json"),
    fetchLocalJson("openalex_data/publication_keywords.json")
  ]);

  const articles = normalizePreparedOpenAlexData({
    publications,
    persons,
    personPublications,
    affiliations,
    publicationTopics,
    publicationKeywords
  });
  await saveArticlesToDb(articles);
  await refreshDatabaseArticles();
  setRawAnalysis("Данные автоматически загружены из файлов openalex_data.", {
    publications: publications.length,
    persons: persons.length,
    affiliations: affiliations.length,
    articles: articles.length
  });
  setProcessedAnalysis(`В браузерную базу добавлено или обновлено статей: ${articles.length}.`, buildProcessedPreviewPayload(articles));
  return {
    source: "openalex_data",
    articlesCount: articles.length
  };
}

async function autoLoadInitialData() {
  // Load live data from PostgreSQL directly into memory (no IndexedDB write)
  try {
    const articles = await fetchLocalJson("/api/articles");
    if (articles && articles.length) {
      state.databaseArticles = articles;
      state.databaseArticles.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
      el.dbCount.textContent = String(state.databaseArticles.length);
      return { source: "PostgreSQL", articlesCount: articles.length };
    }
  } catch (err) {
    console.warn("Сервер недоступен:", err);
  }

  // Fallback: data already in IndexedDB (e.g. from manual file import)
  if (state.databaseArticles.length) {
    return { source: "локальная база браузера", articlesCount: state.databaseArticles.length };
  }

  return { source: "демо-набор", articlesCount: DEMO_ARTICLES.length };
}

function getMapTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return dark ? {
    paper_bgcolor: "#1a2820",
    plot_bgcolor:  "#1a2820",
    landcolor:     "#1e2e25",
    countrycolor:  "#2d4035",
    oceancolor:    "#141e1a",
    coastlinecolor:"#2d4035",
    lakecolor:     "#141e1a",
    bgcolor:       "#1a2820",
    annotationColor: "#7aaa8a"
  } : {
    paper_bgcolor: "#f8fcf9",
    plot_bgcolor:  "#f8fcf9",
    landcolor:     "#edf4ef",
    countrycolor:  "#cfe0d6",
    oceancolor:    "#f7fbf8",
    coastlinecolor:"#cfe0d6",
    lakecolor:     "#f7fbf8",
    bgcolor:       "#f8fcf9",
    annotationColor: "#557063"
  };
}

function renderMap() {
  if (!window.Plotly) {
    el.mapPlot.innerHTML = '<div class="empty" style="padding:18px;">Plotly не загрузился. Проверьте интернет или скачайте библиотеку локально.</div>';
    return;
  }

  const theme = getMapTheme();
  const mapPoints = getMapPoints(state.articles);
  const trace = {
    type: "scattergeo",
    mode: "markers",
    lat: mapPoints.map((item) => item.point.lat),
    lon: mapPoints.map((item) => item.point.lon),
    text: mapPoints.map(({ article, point }) =>
      `<b>${escapeHtml(article.title)}</b><br>ID: ${escapeHtml(article.id)}<br>` +
      `Год: ${escapeHtml(article.year || "—")}<br>Журнал: ${escapeHtml(article.journal || "—")}<br>` +
      `Аффилиация: ${escapeHtml(point.place)}`
    ),
    customdata: mapPoints.map((item) => item.article.id),
    hovertemplate: "%{text}<extra></extra>",
    marker: {
      size: mapPoints.map((item) => item.article.id === state.selectedArticleId ? 14 : 9),
      color: mapPoints.map((item) => item.article.id === state.selectedArticleId ? "#df6f73" : "#3d9e65"),
      opacity: 0.9,
      line: { width: 1, color: "#ffffff" }
    }
  };

  const layout = {
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: theme.paper_bgcolor,
    plot_bgcolor:  theme.plot_bgcolor,
    annotations: mapPoints.length ? [] : [{
      text: "Нет координат для отображения на карте",
      showarrow: false,
      x: 0.5, y: 0.5,
      xref: "paper", yref: "paper",
      font: { size: 18, color: theme.annotationColor }
    }],
    geo: {
      scope: "world",
      projection: { type: "natural earth" },
      showland: true,      landcolor:      theme.landcolor,
      showcountries: true, countrycolor:   theme.countrycolor,
      showocean: true,     oceancolor:     theme.oceancolor,
      coastlinecolor:      theme.coastlinecolor,
      lakecolor:           theme.lakecolor,
      bgcolor:             theme.bgcolor
    }
  };

  Plotly.purge(el.mapPlot);
  Plotly.newPlot(el.mapPlot, [trace], layout, { responsive: true, displayModeBar: true }).then(() => {
    el.mapPlot.on("plotly_click", (eventData) => {
      const point = eventData && eventData.points && eventData.points[0];
      if (point && point.customdata) selectArticle(point.customdata);
    });
    // Force a resize after initial render in case the container had not reached its final
    // dimensions when newPlot ran (e.g. on first page load before layout stabilises).
    // Two nested rAFs ensure the resize fires after the browser has committed layout and paint.
    requestAnimationFrame(() => requestAnimationFrame(() => Plotly.Plots.resize(el.mapPlot)));
  });
}

function intersect(a, b) {
  const left = new Set((a || []).map(normalizeText));
  return (b || []).filter((item) => left.has(normalizeText(item)));
}

function getSharedAffiliations(articleA, articleB) {
  return intersect(
    (articleA.affiliations || []).map((item) => item.place),
    (articleB.affiliations || []).map((item) => item.place)
  );
}

function buildSimilarity(articleA, articleB) {
  const sharedAuthors = intersect(articleA.authors, articleB.authors);
  const sharedTopics = intersect(articleA.topics, articleB.topics);
  const sharedKeywords = intersect(articleA.keywords, articleB.keywords);
  const sharedAffiliations = getSharedAffiliations(articleA, articleB);
  const sameJournal = articleA.journal && articleB.journal && normalizeText(articleA.journal) === normalizeText(articleB.journal);
  let score = sharedAuthors.length * 4 + sharedTopics.length * 3 + sharedKeywords.length * 2 + sharedAffiliations.length * 2;
  if (sameJournal) score += 2;

  const reasons = [];
  if (sharedAuthors.length) reasons.push(`общие авторы: ${sharedAuthors.join(", ")}`);
  if (sharedTopics.length) reasons.push(`общие темы: ${sharedTopics.join(", ")}`);
  if (sharedKeywords.length) reasons.push(`общие ключевые слова: ${sharedKeywords.join(", ")}`);
  if (sameJournal) reasons.push(`один журнал: ${articleA.journal}`);
  if (sharedAffiliations.length) reasons.push(`общие аффилиации: ${sharedAffiliations.join(", ")}`);
  return { source: articleA.id, target: articleB.id, score, reasons, sharedAuthors, sharedTopics, sharedKeywords, sharedAffiliations, sameJournal };
}

function countConnectionsFast(articles, limit = 100000) {
  const n = articles.length;
  if (n < 2) return "0";
  const pairs = new Set();
  const index = new Map();
  for (let i = 0; i < n; i++) {
    const a = articles[i];
    const keys = [];
    if (a.journal) keys.push("j:" + normalizeText(a.journal));
    for (const v of (a.authors || [])) keys.push("u:" + normalizeText(v));
    for (const v of (a.topics || [])) keys.push("t:" + normalizeText(v));
    for (const v of (a.keywords || [])) keys.push("k:" + normalizeText(v));
    for (const af of (a.affiliations || [])) if (af.place) keys.push("af:" + normalizeText(af.place));
    for (const key of keys) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(i);
    }
  }
  outer: for (const group of index.values()) {
    if (group.length < 2) continue;
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        pairs.add(group[a] < group[b] ? group[a] * n + group[b] : group[b] * n + group[a]);
        if (pairs.size >= limit) break outer;
      }
    }
  }
  return pairs.size >= limit ? limit + "+" : String(pairs.size);
}

function buildAllConnections(articles) {
  const connections = [];
  for (let i = 0; i < articles.length; i += 1) {
    for (let j = i + 1; j < articles.length; j += 1) {
      const similarity = buildSimilarity(articles[i], articles[j]);
      if (similarity.score > 0) connections.push(similarity);
    }
  }
  return connections.sort((a, b) => b.score - a.score);
}

function getArticleById(articleId) {
  return state.articles.find((article) => article.id === articleId) || null;
}

function getRankedRelated(articleId) {
  const current = getArticleById(articleId);
  if (!current) return [];
  return state.articles
    .filter((article) => article.id !== articleId)
    .map((article) => ({ article, similarity: buildSimilarity(current, article) }))
    .filter((item) => item.similarity.score > 0)
    .sort((a, b) => b.similarity.score - a.similarity.score || Number(b.article.year || 0) - Number(a.article.year || 0));
}

function truncateLabel(text, maxLength) {
  const source = String(text || "");
  return source.length > maxLength ? `${source.slice(0, maxLength - 1)}…` : source;
}

function renderGraph() {
  const mode = el.graphModeSelect.value;
  if (mode === "overview") {
    renderEntityGraph("overview");
    return;
  }
  if (mode === "yearJournal") {
    renderEntityGraph("yearJournal");
    return;
  }
  if (mode === "authors") {
    renderEntityGraph("authors");
    return;
  }
  if (mode === "affiliations") {
    renderEntityGraph("affiliations");
    return;
  }
  renderSimilarityGraph();
}

function filteredGraphArticlesLimited() {
  const articles = state.articles;
  return {
    articles,
    visibleArticles: articles.slice(0, 70),
    hiddenCount: Math.max(0, articles.length - 70)
  };
}

function nodeKey(type, value) {
  return `${type}:${normalizeText(value)}`;
}

function addEntityNode(nodes, columns, type, id, label, column, articleId = "") {
  const key = nodeKey(type, id || label);
  if (!nodes.has(key)) {
    const node = { key, type, id: String(id || label), label: String(label || id || "—"), column, articleId };
    nodes.set(key, node);
    if (!columns[column]) columns[column] = [];
    columns[column].push(node);
  }
  return key;
}

function addEntityEdge(edges, source, target, label = "") {
  if (source && target) edges.push({ source, target, label });
}

function getEntityGraphData(mode) {
  const { articles, visibleArticles, hiddenCount } = filteredGraphArticlesLimited();
  const nodes = new Map();
  const columns = {};
  const edges = [];

  visibleArticles.forEach((article) => {
    const articleKey = addEntityNode(nodes, columns, "article", article.id, article.title, "article", article.id);

    if (mode === "overview" || mode === "yearJournal") {
      const yearKey = addEntityNode(nodes, columns, "year", article.year || "Без года", article.year || "Без года", "year");
      const journalKey = addEntityNode(nodes, columns, "journal", article.journal || "Без журнала", article.journal || "Без журнала", "journal");
      addEntityEdge(edges, yearKey, articleKey, "год");
      addEntityEdge(edges, journalKey, articleKey, "журнал");
    }

    if (mode === "overview" || mode === "authors") {
      (article.authors || []).slice(0, mode === "overview" ? 2 : 5).forEach((author) => {
        const authorKey = addEntityNode(nodes, columns, "author", author, author, "author");
        addEntityEdge(edges, articleKey, authorKey, "автор");
      });
    }

    if (mode === "overview" || mode === "affiliations") {
      (article.affiliations || []).slice(0, mode === "overview" ? 2 : 5).forEach((affiliation) => {
        const place = affiliation.place || "Неизвестная аффилиация";
        const affiliationKey = addEntityNode(nodes, columns, "affiliation", place, place, "affiliation");
        addEntityEdge(edges, articleKey, affiliationKey, "аффилиация");
      });
    }
  });

  return { allCount: articles.length, hiddenCount, nodes, columns, edges };
}

function getGraphColumns(mode) {
  if (mode === "yearJournal") {
    return [
      { key: "year", title: "Годы", x: 120, width: 190 },
      { key: "journal", title: "Журналы", x: 390, width: 260 },
      { key: "article", title: "Статьи", x: 790, width: 430 }
    ];
  }
  if (mode === "authors") {
    return [
      { key: "article", title: "Статьи", x: 360, width: 460 },
      { key: "author", title: "Авторы", x: 930, width: 360 }
    ];
  }
  if (mode === "affiliations") {
    return [
      { key: "article", title: "Статьи", x: 330, width: 430 },
      { key: "affiliation", title: "Аффилиации", x: 920, width: 430 }
    ];
  }
  return [
    { key: "year", title: "Годы", x: 100, width: 160 },
    { key: "journal", title: "Журналы", x: 330, width: 230 },
    { key: "article", title: "Статьи", x: 690, width: 360 },
    { key: "author", title: "Авторы", x: 1050, width: 250 },
    { key: "affiliation", title: "Аффилиации", x: 1320, width: 300 }
  ];
}

function columnNodeHeight(type) {
  return type === "article" ? 54 : 42;
}

function getGraphTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return dark ? {
    nodeFill:    { year: "#2a5e3f", journal: "#1e2e25", article: "#1e2e25", author: "#2a2518", affiliation: "#1c2b22" },
    nodeStroke:  { year: "#3d9e65", journal: "#3a5545", article: "#3a5545", author: "#8a6030",  affiliation: "#3a5545" },
    textMain:    { year: "#d4edd9", other: "#a8ddb8" },
    textSub:     { year: "#a8ddb8", other: "#7aaa8a" },
    edgeSelected: "#3d9e65",
    edgeDefault:  "#2d4035",
    titleFill:    "#a8ddb8",
    emptyFill:    "#7aaa8a",
    simFill:      "#1e2e25",
    simStroke:    "#3d9e65",
    simTitle:     "#d4edd9",
    simMeta:      "#7aaa8a",
    simId:        "#5a7568"
  } : {
    nodeFill:    { year: "#3f7f5c", journal: "#f5faf7", article: "#ffffff", author: "#fff8ec", affiliation: "#eef7f1" },
    nodeStroke:  { year: "#23613f", journal: "#7da48d", article: "#2d6a47", author: "#c18a3d",  affiliation: "#8bb29a" },
    textMain:    { year: "#ffffff", other: "#153024" },
    textSub:     { year: "#eafff1", other: "#60796d" },
    edgeSelected: "#23613f",
    edgeDefault:  "#b7cbc0",
    titleFill:    "#183528",
    emptyFill:    "#557063",
    simFill:      "#ffffff",
    simStroke:    "#2d6a47",
    simTitle:     "#153024",
    simMeta:      "#4e6b5d",
    simId:        "#6a8277"
  };
}

function entityColor(type) {
  return getGraphTheme().nodeFill[type] || getGraphTheme().simFill;
}

function entityStroke(type) {
  return getGraphTheme().nodeStroke[type] || "#9cbba9";
}

function entityTextColor(type) {
  const t = getGraphTheme();
  return type === "year" ? t.textMain.year : t.textMain.other;
}

function renderEntityGraph(mode) {
  const data = getEntityGraphData(mode);
  const columnsConfig = getGraphColumns(mode);

  if (!data.allCount) {
    const t = getGraphTheme();
    el.graphSvg.innerHTML = `<rect x="0" y="0" width="1400" height="900" fill="transparent"></rect><text x="700" y="450" text-anchor="middle" class="graph-empty">Нет данных для отображения графа</text>`;
    return;
  }

  const columnMaxItems = Math.max(...columnsConfig.map((column) => (data.columns[column.key] || []).length), 1);
  const height = Math.max(900, 150 + columnMaxItems * 68);
  const width = mode === "overview" ? 1500 : 1300;
  const positions = {};
  const t = getGraphTheme();
  const parts = [`<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>`];

  const title = {
    overview: "Общий граф: годы, журналы, статьи, авторы и аффилиации",
    yearJournal: "Связи годов, журналов и статей",
    authors: "Связи статей и авторов",
    affiliations: "Связи статей и аффилиаций"
  }[mode];
  parts.push(`<text x="${width / 2}" y="34" text-anchor="middle" class="graph-title">${escapeHtml(title)}</text>`);
  if (data.hiddenCount) {
    parts.push(`<text x="${width / 2}" y="58" text-anchor="middle" class="graph-note">Показаны первые 70 статей из ${data.allCount}. Используйте фильтры, чтобы сузить граф.</text>`);
  }

  columnsConfig.forEach((column) => {
    const nodes = data.columns[column.key] || [];
    parts.push(`<text x="${column.x}" y="92" text-anchor="middle" class="graph-column-title">${escapeHtml(column.title)} (${nodes.length})</text>`);
    nodes.forEach((node, index) => {
      const y = 130 + index * 68;
      positions[node.key] = { x: column.x, y, width: column.width, node };
    });
  });

  data.edges.forEach((edge) => {
    const source = positions[edge.source];
    const target = positions[edge.target];
    if (!source || !target) return;
    const selected = source.node.articleId === state.selectedArticleId || target.node.articleId === state.selectedArticleId;
    const stroke = selected ? t.edgeSelected : t.edgeDefault;
    const strokeWidth = selected ? 2.8 : 1.35;
    const opacity = selected ? 0.95 : 0.55;
    const x1 = source.x + source.width / 2;
    const x2 = target.x - target.width / 2;
    const c1 = x1 + Math.max(70, Math.abs(x2 - x1) * 0.35);
    const c2 = x2 - Math.max(70, Math.abs(x2 - x1) * 0.35);
    parts.push(`<path d="M ${x1} ${source.y} C ${c1} ${source.y}, ${c2} ${target.y}, ${x2} ${target.y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"></path>`);
  });

  Object.values(positions).forEach(({ x, y, width: nodeWidth, node }) => {
    const h = columnNodeHeight(node.type);
    const activeClass = node.articleId === state.selectedArticleId ? " active" : "";
    const clickAttr = node.articleId ? ` data-article-id="${escapeHtml(node.articleId)}"` : "";
    const labelLimit = Math.max(14, Math.floor(nodeWidth / 7));
    parts.push(`<g class="graph-node${activeClass}"${clickAttr}>`);
    parts.push(`<rect x="${x - nodeWidth / 2}" y="${y - h / 2}" width="${nodeWidth}" height="${h}" rx="10" fill="${entityColor(node.type)}" stroke="${entityStroke(node.type)}" stroke-width="1.4"></rect>`);
    parts.push(`<text x="${x}" y="${y - 3}" text-anchor="middle" font-size="12" fill="${entityTextColor(node.type)}" font-weight="700">${escapeHtml(truncateLabel(node.label, labelLimit))}</text>`);
    parts.push(`<text x="${x}" y="${y + 14}" text-anchor="middle" font-size="10" fill="${node.type === "year" ? t.textSub.year : t.textSub.other}">${escapeHtml(node.type === "article" ? node.id : node.type)}</text>`);
    parts.push("</g>");
  });

  el.graphSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  el.graphSvg.style.minWidth = `${width}px`;
  el.graphSvg.style.height = `${height}px`;
  el.graphSvg.innerHTML = parts.join("");
  el.graphSvg.querySelectorAll(".graph-node[data-article-id]").forEach((node) => {
    node.addEventListener("click", () => selectArticle(node.getAttribute("data-article-id")));
  });
}

function renderSimilarityGraph() {
  const filteredArticles = state.articles;
  const connections = buildAllConnections(filteredArticles);
  if (!filteredArticles.length) {
    el.graphSvg.innerHTML = `<rect x="0" y="0" width="1400" height="900" fill="transparent"></rect><text x="700" y="450" text-anchor="middle" class="graph-empty">Нет данных для отображения графа</text>`;
    return;
  }

  const width = 1400;
  const height = Math.max(900, 140 + filteredArticles.length * 112);
  const articleX = 700;
  const positions = {};
  filteredArticles.forEach((article, index) => {
    positions[article.id] = { x: articleX, y: 120 + index * 112 };
  });

  const t = getGraphTheme();
  const parts = [`<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>`];
  parts.push(`<text x="700" y="46" text-anchor="middle" class="graph-title">Связи статей</text>`);

  connections.slice(0, 120).forEach((link) => {
    const sourcePos = positions[link.source];
    const targetPos = positions[link.target];
    if (!sourcePos || !targetPos) return;
    const selected = link.source === state.selectedArticleId || link.target === state.selectedArticleId;
    const stroke = selected ? t.edgeSelected : t.edgeDefault;
    const strokeWidth = selected ? 2.8 : 1.5;
    const opacity = selected ? 0.95 : 0.7;
    parts.push(`<path d="M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + 180} ${sourcePos.y}, ${targetPos.x + 180} ${targetPos.y}, ${targetPos.x} ${targetPos.y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"></path>`);
    const labels = [];
    if (link.sharedAuthors.length) labels.push("авторы");
    if (link.sharedTopics.length) labels.push("темы");
    if (link.sameJournal) labels.push("журнал");
    if (link.sharedKeywords.length) labels.push("ключевые слова");
    if (link.sharedAffiliations.length) labels.push("аффилиации");
    parts.push(`<text class="edge-label" x="${sourcePos.x + 230}" y="${(sourcePos.y + targetPos.y) / 2 - 6}">${escapeHtml(labels.join(", "))} (${link.score})</text>`);
  });

  filteredArticles.forEach((article) => {
    const pos = positions[article.id];
    const activeClass = article.id === state.selectedArticleId ? " active" : "";
    parts.push(`<g class="graph-node${activeClass}" data-article-id="${escapeHtml(article.id)}">`);
    parts.push(`<rect x="${pos.x - 220}" y="${pos.y - 34}" width="440" height="68" rx="12" fill="${t.simFill}" stroke="${t.simStroke}" stroke-width="1.5"></rect>`);
    parts.push(`<text x="${pos.x}" y="${pos.y - 8}" text-anchor="middle" font-size="13" fill="${t.simTitle}" font-weight="700">${escapeHtml(truncateLabel(article.title, 62))}</text>`);
    parts.push(`<text x="${pos.x}" y="${pos.y + 12}" text-anchor="middle" font-size="11" fill="${t.simMeta}">${escapeHtml(String(article.year || "—"))} • ${escapeHtml(truncateLabel(article.journal || "Без журнала", 48))}</text>`);
    parts.push(`<text x="${pos.x}" y="${pos.y + 28}" text-anchor="middle" font-size="10" fill="${t.simId}">ID: ${escapeHtml(article.id)}</text>`);
    parts.push("</g>");
  });

  el.graphSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  el.graphSvg.style.minWidth = `${width}px`;
  el.graphSvg.style.height = `${height}px`;
  el.graphSvg.innerHTML = parts.join("");
  el.graphSvg.querySelectorAll(".graph-node").forEach((node) => {
    node.addEventListener("click", () => selectArticle(node.getAttribute("data-article-id")));
  });
}

function renderArticleList() {
  const articles = state.articles;
  el.articleList.innerHTML = "";
  if (!articles.length) {
    el.articleList.innerHTML = '<div class="empty" style="padding:10px;">Статьи не найдены.</div>';
    return;
  }
  const LIST_LIMIT = 200;
  articles.slice(0, LIST_LIMIT).forEach((article) => {
    const item = document.createElement("div");
    item.className = "article-list-item";
    if (article.id === state.selectedArticleId) item.classList.add("active");
    item.innerHTML =
      `<div class="article-list-title">${escapeHtml(article.title)}</div>` +
      `<div class="meta">${escapeHtml(String(article.year || "—"))} • ${escapeHtml(article.journal || "—")} • ${(article.affiliations || []).length} аффилиаций</div>`;
    item.addEventListener("click", () => selectArticle(article.id));
    el.articleList.appendChild(item);
  });
  if (articles.length > LIST_LIMIT) {
    const note = document.createElement("div");
    note.className = "empty";
    note.style.padding = "8px 10px";
    note.textContent = `Показано ${LIST_LIMIT} из ${articles.length}. Используйте фильтры для уточнения.`;
    el.articleList.appendChild(note);
  }
}

function renderSelectedArticle() {
  const article = getArticleById(state.selectedArticleId);
  if (!article) {
    el.selectedArticleSection.hidden = false;
    el.selectedArticleBox.className = "empty";
    el.selectedArticleBox.innerHTML = "Выберите статью на карте или в списке.";
    return;
  }
  el.selectedArticleSection.hidden = false;
  const affiliations = (article.affiliations || []).map((item) => item.place).join(", ") || "—";
  const topics = (article.topics || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
  const keywords = (article.keywords || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
  el.selectedArticleBox.className = "";
  el.selectedArticleBox.innerHTML =
    `<div class="article-list-title">${escapeHtml(article.title)}</div>` +
    `<div class="meta" style="margin-top:8px;"><strong>ID:</strong> ${escapeHtml(article.id)}</div>` +
    `<div class="meta"><strong>Год:</strong> ${escapeHtml(article.year || "—")}</div>` +
    `<div class="meta"><strong>Журнал:</strong> ${escapeHtml(article.journal || "—")}</div>` +
    `<div class="meta"><strong>Авторы:</strong> ${escapeHtml((article.authors || []).join(", ") || "—")}</div>` +
    `<div class="meta"><strong>Аффилиации:</strong> ${escapeHtml(affiliations)}</div>` +
    (topics ? `<div class="tag-list">${topics}</div>` : "") +
    (keywords ? `<div class="tag-list">${keywords}</div>` : "") +
    `<div id="abstractBox" class="info-card" style="margin-top:10px;color:#888;">Загрузка аннотации...</div>`;

  // Fetch abstract on demand
  fetch(`/api/article/${encodeURIComponent(article.id)}`)
    .then((r) => r.json())
    .then((data) => {
      const box = document.getElementById("abstractBox");
      if (!box) return;
      if (data.abstractText) {
        box.style.color = "";
        box.textContent = data.abstractText;
      } else {
        box.textContent = "Аннотация отсутствует.";
      }
    })
    .catch(() => {
      const box = document.getElementById("abstractBox");
      if (box) box.textContent = "Аннотация недоступна.";
    });
}

function renderRankedRelated() {
  const article = getArticleById(state.selectedArticleId);
  if (!article) {
    el.rankedRelatedBox.innerHTML = '<div class="empty">Выберите статью, чтобы увидеть похожие материалы.</div>';
    return;
  }
  const ranked = getRankedRelated(article.id).slice(0, 20);
  if (!ranked.length) {
    el.rankedRelatedBox.innerHTML = '<div class="empty">Для выбранной статьи похожие материалы не найдены.</div>';
    return;
  }
  el.rankedRelatedBox.innerHTML = ranked.map((item) => (
    `<div class="rank-item" data-article-id="${escapeHtml(item.article.id)}">` +
    `<div class="score-badge">Сходство: ${item.similarity.score}</div>` +
    `<div class="rank-title">${escapeHtml(item.article.title)}</div>` +
    `<div class="meta">${escapeHtml(item.article.year || "—")} • ${escapeHtml(item.article.journal || "—")}</div>` +
    `<div class="meta" style="margin-top:6px;">${escapeHtml(item.similarity.reasons.join("; "))}</div>` +
    "</div>"
  )).join("");
  el.rankedRelatedBox.querySelectorAll(".rank-item").forEach((item) => {
    item.addEventListener("click", () => selectArticle(item.getAttribute("data-article-id")));
  });
}

function renderGraphDetails() {
  const article = getArticleById(state.selectedArticleId);
  if (!article) {
    el.graphDetails.className = "empty";
    el.graphDetails.textContent = "Выберите статью, чтобы увидеть подробности связей.";
    return;
  }
  const ranked = getRankedRelated(article.id).slice(0, 5);
  el.graphDetails.className = "";
  el.graphDetails.innerHTML =
    `<div class="info-card"><div class="article-list-title">${escapeHtml(article.title)}</div>` +
    `<div class="meta" style="margin-top:6px;">Всего связей: ${ranked.length}</div>` +
    `<div class="meta">Основные темы: ${escapeHtml((article.topics || []).join(", ") || "—")}</div></div>` +
    ranked.map((item) => (
      `<div class="info-card" style="margin-top:10px;"><div class="rank-title">${escapeHtml(item.article.title)}</div>` +
      `<div class="meta">Вес связи: ${item.similarity.score}</div>` +
      `<div class="meta">${escapeHtml(item.similarity.reasons.join("; "))}</div></div>`
    )).join("");
}

function renderStats() {
  el.dbCount.textContent = String(state.databaseArticles.length);
  el.shownCount.textContent = String(state.articles.length);
  el.geoCount.textContent = String(countArticlesWithGeo(state.articles));
  const institutions = new Set();
  for (const a of state.articles) {
    for (const af of (a.affiliations || [])) {
      if (af.place) institutions.add(normalizeText(af.place));
    }
  }
  el.linksCount.textContent = String(institutions.size);
}

function renderAll() {
  renderStats();
  renderArticleList();
  renderSelectedArticle();
  renderRankedRelated();
  renderGraphDetails();
  // renderMap and renderGraph are heavy — always called via requestAnimationFrame
}

function scheduleMapAndGraph() {
  requestAnimationFrame(() => {
    renderMap();
    renderGraph();
  });
}

function selectArticle(articleId) {
  state.selectedArticleId = articleId;
  renderArticleList();
  renderSelectedArticle();
  renderRankedRelated();
  renderGraphDetails();
  scheduleMapAndGraph();
}

function setRawAnalysis(metaText, payload) {
  el.rawMeta.textContent = metaText;
  el.rawData.textContent = safeJsonStringify(payload);
}

function setProcessedAnalysis(metaText, payload) {
  el.processedMeta.textContent = metaText;
  el.processedData.textContent = safeJsonStringify(payload);
}

function downloadFile(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadAnalysisFile() {
  const payload = {
    createdAt: new Date().toISOString(),
    rawMeta: el.rawMeta.textContent,
    rawData: el.rawData.textContent,
    processedMeta: el.processedMeta.textContent,
    processedData: el.processedData.textContent
  };
  downloadFile("article_analysis.json", JSON.stringify(payload, null, 2));
}

async function exportDatabase() {
  await refreshDatabaseArticles();
  downloadFile("articles_database_export.json", JSON.stringify(state.databaseArticles, null, 2));
}

function setViewMode(mode) {
  state.currentMode = mode;
  const isMap   = mode === "map";
  const isGraph = mode === "graph";
  el.mapView.hidden   = !isMap;
  el.graphView.hidden = !isGraph;
  el.mapViewBtn.classList.toggle("secondary",   !isMap);
  el.graphViewBtn.classList.toggle("secondary", !isGraph);
  if (isMap && window.Plotly) {
    // Use a nested rAF so the resize fires after the current rAF render batch
    // (which is where scheduleMapAndGraph renders the initial map).
    requestAnimationFrame(() => requestAnimationFrame(() => Plotly.Plots.resize(el.mapPlot)));
  }
}

function toggleDbPanel(open) {
  const show = open !== undefined ? open : el.dbView.hidden;
  el.dbView.hidden = !show;
  el.dbViewBtn.classList.toggle("secondary", !show);
  if (show) el.dbView.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadDemoToDatabase() {
  await saveArticlesToDb(DEMO_ARTICLES);
  await refreshDatabaseArticles();
  setRawAnalysis("В базу добавлен демонстрационный набор.", DEMO_ARTICLES);
  setProcessedAnalysis("Демо-статьи сохранены в IndexedDB.", buildProcessedPreviewPayload(DEMO_ARTICLES));
  showAllArticlesAndRender();
  setStatus(`Демонстрационные статьи добавлены в базу.\nВсего статей в базе: ${state.databaseArticles.length}.`);
}

async function clearDbAndRefresh() {
  if (!confirm("Очистить всю локальную базу статей в браузере?")) return;
  await clearDatabase();
  await refreshDatabaseArticles();
  state.articles = DEMO_ARTICLES.slice();
  state.selectedArticleId = null;
  setRawAnalysis("База очищена. Показан демо-набор без сохранения в базе.", []);
  setProcessedAnalysis("Обработка ещё не выполнялась.", []);
  renderAll();
  scheduleMapAndGraph();
  setStatus("База данных очищена. Для постоянной работы загрузите файл или добавьте демо в базу.");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function setButtonsDisabled(disabled) {
  [
    el.importBtn,
    el.exportDbBtn,
    el.demoDbBtn,
    el.clearDbBtn,

  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function getCurrentSourceArticles() {
  return state.databaseArticles.length ? state.databaseArticles : DEMO_ARTICLES;
}

function fillSelectOptions(select, placeholder, values, currentValue, limit = 500) {
  const seen = new Set();
  const collected = [];
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      collected.push(v);
      if (collected.length >= limit) break;
    }
  }
  collected.sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  select.innerHTML = "";
  select.appendChild(new Option(placeholder, ""));
  collected.forEach((value) => select.appendChild(new Option(value, value)));
  const cur = seen.has((currentValue || "").toLowerCase()) ? currentValue : "";
  select.value = cur;
  return cur;
}

function* iterField(source, getter) {
  for (const article of source) yield* getter(article);
}

function populateEntityFilters() {
  const source = getCurrentSourceArticles();
  const { year: y, journal: j, author: au, affiliation: af } = state.filters;

  // Для каждого фильтра показываем варианты, доступные при текущих остальных фильтрах
  const forYear = source.filter((a) =>
    (!j  || a.journal === j) &&
    (!au || (a.authors || []).includes(au)) &&
    (!af || (a.affiliations || []).map((x) => x.place).includes(af))
  );
  const forJournal = source.filter((a) =>
    (!y  || String(a.year || "") === y) &&
    (!au || (a.authors || []).includes(au)) &&
    (!af || (a.affiliations || []).map((x) => x.place).includes(af))
  );
  const forAuthor = source.filter((a) =>
    (!y  || String(a.year || "") === y) &&
    (!j  || a.journal === j) &&
    (!af || (a.affiliations || []).map((x) => x.place).includes(af))
  );
  const forAffiliation = source.filter((a) =>
    (!y  || String(a.year || "") === y) &&
    (!j  || a.journal === j) &&
    (!au || (a.authors || []).includes(au))
  );

  state.filters.year = fillSelectOptions(
    el.filterYearSelect, "Все годы",
    iterField(forYear, (a) => a.year ? [String(a.year)] : []),
    state.filters.year
  );
  state.filters.journal = fillSelectOptions(
    el.filterJournalSelect, "Все журналы",
    iterField(forJournal, (a) => a.journal ? [a.journal] : []),
    state.filters.journal
  );
  state.filters.author = fillSelectOptions(
    el.filterAuthorSelect, "Все авторы",
    iterField(forAuthor, (a) => a.authors || []),
    state.filters.author
  );
  state.filters.affiliation = fillSelectOptions(
    el.filterAffiliationSelect, "Все аффилиации",
    iterField(forAffiliation, (a) => (a.affiliations || []).map((x) => x.place || "")),
    state.filters.affiliation
  );
}

function readEntityFilters() {
  state.filters.year = el.filterYearSelect.value;
  state.filters.journal = el.filterJournalSelect.value;
  state.filters.author = el.filterAuthorSelect.value;
  state.filters.affiliation = el.filterAffiliationSelect.value;
}

function articleMatchesFilters(article, skip = "") {
  const affiliations = (article.affiliations || []).map((item) => item.place);
  return (skip === "year" || !state.filters.year || String(article.year || "") === state.filters.year) &&
    (skip === "journal" || !state.filters.journal || article.journal === state.filters.journal) &&
    (skip === "author" || !state.filters.author || (article.authors || []).includes(state.filters.author)) &&
    (skip === "affiliation" || !state.filters.affiliation || affiliations.includes(state.filters.affiliation));
}

function describeActiveFilters() {
  const parts = [];
  if (state.filters.year) parts.push(`год: ${state.filters.year}`);
  if (state.filters.journal) parts.push(`журнал: ${state.filters.journal}`);
  if (state.filters.author) parts.push(`автор: ${state.filters.author}`);
  if (state.filters.affiliation) parts.push(`аффилиация: ${state.filters.affiliation}`);
  return parts.length ? parts.join("; ") : "все данные";
}

async function init() {
  // Show demo immediately — page is interactive before any async work completes
  state.articles = DEMO_ARTICLES.slice();
  setViewMode("map");
  renderAll();
  scheduleMapAndGraph();
  setStatus("Загрузка данных из PostgreSQL...");

  // Start API fetch immediately — does NOT wait for IndexedDB
  const apiFetch = fetchLocalJson("/api/articles")
    .then((articles) => {
      if (!articles || !articles.length) {
        setStatus("Сервер вернул пустой ответ. Показан демонстрационный набор.");
        return;
      }
      state.databaseArticles = articles;
      state.databaseArticles.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
      setRawAnalysis("Данные получены через API локального сервера из PostgreSQL.", { endpoint: "/api/articles", articles: articles.length });
      showAllArticlesAndRender();
      setStatus(`Загружено из PostgreSQL: ${state.databaseArticles.length} статей.`);
    })
    .catch(() => {
      setStatus("Сервер недоступен. Показан демонстрационный набор.");
    });

  // Open IndexedDB in parallel — optional, failures do not affect map data
  openDatabase()
    .then((db) => { state.db = db; })
    .catch((err) => { console.warn("IndexedDB недоступен:", err); });

  // Await the API fetch so unhandled rejections are not swallowed
  await apiFetch;
}

el.loadPgBtn = document.getElementById("loadPgBtn");
el.loadPgBtn.addEventListener("click", loadServersqlprojData);

el.importBtn.addEventListener("click", importSelectedFiles);
el.exportDbBtn.addEventListener("click", exportDatabase);
el.demoDbBtn.addEventListener("click", loadDemoToDatabase);
el.clearDbBtn.addEventListener("click", clearDbAndRefresh);

el.mapViewBtn.addEventListener("click", () => setViewMode("map"));
el.graphViewBtn.addEventListener("click", () => setViewMode("graph"));
el.dbViewBtn.addEventListener("click", () => toggleDbPanel());
el.dbCloseBtn.addEventListener("click", () => toggleDbPanel(false));
el.graphModeSelect.addEventListener("change", () => {
  scheduleMapAndGraph();
  renderGraphDetails();
});
[
  el.filterYearSelect,
  el.filterJournalSelect,
  el.filterAuthorSelect,
  el.filterAffiliationSelect
].forEach((select) => select.addEventListener("change", showAllArticlesAndRender));
el.downloadAnalysisBtn.addEventListener("click", downloadAnalysisFile);

init();
