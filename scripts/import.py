import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent.parent
BASE_URL = "https://api.openalex.org"
JSON_OUTPUT_FILE = BASE_DIR / "article_data.json"
TEXT_OUTPUT_FILE = BASE_DIR / "article_summary.txt"
FALLBACK_TEXT_OUTPUT_FILE = BASE_DIR / "article_summary_latest.txt"
USER_AGENT = "Mozilla/5.0 (compatible; openalex-client/1.0)"
PER_PAGE = 200
MAX_PAGES = 50
REQUEST_TIMEOUT = 30

MSG_INVALID_CACHE = "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 \u043a\u044d\u0448\u0430 article_data.json"
MSG_NO_JOURNAL = "\u0411\u0435\u0437 \u0436\u0443\u0440\u043d\u0430\u043b\u0430"
MSG_NOT_SPECIFIED = "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e"
MSG_AUTHORS_MISSING = "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u044b"
MSG_NO_JOURNALS = "\u043d\u0435\u0442 \u0436\u0443\u0440\u043d\u0430\u043b\u043e\u0432"
MSG_PAGE_LOADED = "\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430"
MSG_ARTICLES = "\u0441\u0442\u0430\u0442\u0435\u0439"
MSG_DATA_HEADER = "=== \u0414\u0410\u041d\u041d\u042b\u0415 \u041e \u0421\u0422\u0410\u0422\u042c\u042f\u0425 ==="
MSG_SOURCE = "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a: OpenAlex API /works"
MSG_TOTAL_ARTICLES = "\u0412\u0441\u0435\u0433\u043e \u0441\u0442\u0430\u0442\u0435\u0439"
MSG_TOTAL_JOURNALS = "\u0412\u0441\u0435\u0433\u043e \u0436\u0443\u0440\u043d\u0430\u043b\u043e\u0432"
MSG_LIMIT = "\u041e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438"
MSG_JOURNAL = "\u0416\u0443\u0440\u043d\u0430\u043b"
MSG_ARTICLE_COUNT = "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u0441\u0442\u0430\u0442\u0435\u0439"
MSG_ARTICLE = "\u0421\u0442\u0430\u0442\u044c\u044f"
MSG_TITLE = "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435"
MSG_AUTHORS = "\u0410\u0432\u0442\u043e\u0440\u044b"
MSG_THEME = "\u0422\u0435\u043c\u0430"
MSG_FINISHED = "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430."
MSG_JOURNALS = "\u0416\u0443\u0440\u043d\u0430\u043b\u044b"
MSG_CACHED_REFRESH_FAILED = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u0438\u0437 OpenAlex"
MSG_USING_CACHE = "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e \u0443\u0436\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043d\u044b\u0439 article_data.json."
MSG_JSON_EXISTS = "JSON \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442"
MSG_SUMMARY_UPDATED = "\u0422\u0435\u043a\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0432\u043e\u0434\u043a\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430"
MSG_SUMMARY_BUSY = "\u0424\u0430\u0439\u043b article_summary.txt \u0441\u0435\u0439\u0447\u0430\u0441 \u0437\u0430\u043d\u044f\u0442, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0441\u0432\u043e\u0434\u043a\u0430 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0430 \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439."
MSG_NO_ARTICLES = "\u0421\u0442\u0430\u0442\u044c\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b \u0432 OpenAlex."
MSG_JSON_SAVED = "JSON \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d \u0432"
MSG_SUMMARY_SAVED = "\u0422\u0435\u043a\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0432\u043e\u0434\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430 \u0432"
MSG_SUMMARY_FALLBACK_SAVED = "\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u0430\u044f \u0442\u0435\u043a\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0432\u043e\u0434\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430 \u0432"
MSG_HTTP_ERROR = "HTTP \u043e\u0448\u0438\u0431\u043a\u0430"
MSG_NETWORK_ERROR = "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0442\u0438"
MSG_FILE_NOT_FOUND = "\u0424\u0430\u0439\u043b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d"
MSG_UNEXPECTED = "\u041d\u0435\u043e\u0436\u0438\u0434\u0430\u043d\u043d\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430"


def configure_output_encoding():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


def fetch_json(url: str):
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
        return json.load(response)


def write_text_if_possible(path: Path, content: str):
    try:
        path.write_text(content, encoding="utf-8")
        return path
    except PermissionError:
        print(MSG_SUMMARY_BUSY)
        FALLBACK_TEXT_OUTPUT_FILE.write_text(content, encoding="utf-8")
        return FALLBACK_TEXT_OUTPUT_FILE


def load_cached_grouped_articles():
    if not JSON_OUTPUT_FILE.exists():
        return None

    cached_data = json.loads(JSON_OUTPUT_FILE.read_text(encoding="utf-8"))
    if not isinstance(cached_data, list):
        raise ValueError(MSG_INVALID_CACHE)

    grouped_articles = {}
    for item in cached_data:
        if not isinstance(item, dict):
            continue
        journal_name = item.get("journal") or MSG_NO_JOURNAL
        articles = item.get("articles") or []
        if isinstance(articles, list):
            grouped_articles[journal_name] = articles

    return grouped_articles


def load_articles():
    articles = []
    cursor = "*"

    for page_number in range(1, MAX_PAGES + 1):
        query = urlencode({"per-page": PER_PAGE, "cursor": cursor})
        data = fetch_json(f"{BASE_URL}/works?{query}")
        results = data.get("results", [])
        if not results:
            break

        articles.extend(results)
        print(f"{MSG_PAGE_LOADED} {page_number}, {MSG_ARTICLES}: {len(articles)}")

        meta = data.get("meta") or {}
        cursor = meta.get("next_cursor")
        if not cursor:
            break

    return articles


def get_journal_name(article):
    primary_location = article.get("primary_location") or {}
    source = primary_location.get("source") or {}
    return source.get("display_name") or MSG_NO_JOURNAL


def get_sort_year(article):
    return article.get("publication_year") or 0


def get_article_summary_lines(article):
    authorships = article.get("authorships") or []
    author_names = [
        (authorship.get("author") or {}).get("display_name")
        for authorship in authorships
        if (authorship.get("author") or {}).get("display_name")
    ]
    primary_topic = article.get("primary_topic") or {}
    topic_names = []

    primary_topic_name = primary_topic.get("display_name")
    if primary_topic_name:
        topic_names.append(primary_topic_name)

    for topic in article.get("topics") or []:
        topic_name = topic.get("display_name")
        if topic_name and topic_name not in topic_names:
            topic_names.append(topic_name)
        if len(topic_names) >= 3:
            break

    theme_text = ", ".join(topic_names) if topic_names else MSG_NOT_SPECIFIED

    return [
        f"{MSG_TITLE}: {article.get('display_name') or MSG_NOT_SPECIFIED}",
        f"{MSG_AUTHORS}: {', '.join(author_names) if author_names else MSG_AUTHORS_MISSING}",
        f"{MSG_THEME}: {theme_text}",
    ]


def sort_articles_by_journal(articles):
    grouped = defaultdict(list)
    for article in articles:
        grouped[get_journal_name(article)].append(article)

    sorted_grouped = {}
    for journal_name in sorted(grouped, key=lambda name: name.lower()):
        sorted_grouped[journal_name] = sorted(
            grouped[journal_name],
            key=lambda article: (-get_sort_year(article), (article.get("display_name") or "").lower()),
        )
    return sorted_grouped


def build_summary(grouped_articles):
    total_articles = sum(len(articles) for articles in grouped_articles.values())
    lines = [
        MSG_DATA_HEADER,
        MSG_SOURCE,
        f"{MSG_TOTAL_ARTICLES}: {total_articles}",
        f"{MSG_TOTAL_JOURNALS}: {len(grouped_articles)}",
        f"{MSG_LIMIT}: {MAX_PAGES} \u0441\u0442\u0440\u0430\u043d\u0438\u0446 \u043f\u043e {PER_PAGE} \u0441\u0442\u0430\u0442\u0435\u0439",
        "",
    ]

    for journal_name, articles in grouped_articles.items():
        lines.append(f"=== {MSG_JOURNAL}: {journal_name} ===")
        lines.append(f"{MSG_ARTICLE_COUNT}: {len(articles)}")
        lines.append("")

        for index, article in enumerate(articles, start=1):
            lines.append(f"{MSG_ARTICLE} {index}:")
            lines.extend(get_article_summary_lines(article))
            lines.append("")

    return "\n".join(lines).strip()


def build_console_summary(grouped_articles):
    total_articles = sum(len(articles) for articles in grouped_articles.values())
    journal_names = list(grouped_articles.keys())
    preview = ", ".join(journal_names[:10]) if journal_names else MSG_NO_JOURNALS
    if len(journal_names) > 10:
        preview += ", ..."

    return "\n".join(
        [
            MSG_FINISHED,
            f"{MSG_TOTAL_ARTICLES}: {total_articles}",
            f"{MSG_TOTAL_JOURNALS}: {len(grouped_articles)}",
            f"{MSG_JOURNALS}: {preview}",
        ]
    )


def save_outputs(grouped_articles, summary: str):
    serializable = []
    for journal_name, articles in grouped_articles.items():
        serializable.append({"journal": journal_name, "articles": articles})

    JSON_OUTPUT_FILE.write_text(
        json.dumps(serializable, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return write_text_if_possible(TEXT_OUTPUT_FILE, summary)


def save_summary_only(grouped_articles):
    summary = build_summary(grouped_articles)
    return write_text_if_possible(TEXT_OUTPUT_FILE, summary)


def handle_cached_fallback(error_message: str):
    grouped_articles = load_cached_grouped_articles()
    if not grouped_articles:
        raise RuntimeError(error_message)

    summary_path = save_summary_only(grouped_articles)
    print(f"{MSG_CACHED_REFRESH_FAILED}: {error_message}")
    print(MSG_USING_CACHE)
    print(build_console_summary(grouped_articles))
    print(f"\n{MSG_JSON_EXISTS}: {JSON_OUTPUT_FILE.resolve()}")
    print(f"{MSG_SUMMARY_UPDATED}: {summary_path.resolve()}")


def main():
    configure_output_encoding()

    try:
        articles = load_articles()
        if not articles:
            print(MSG_NO_ARTICLES)
            return

        grouped_articles = sort_articles_by_journal(articles)
        summary = build_summary(grouped_articles)
        summary_path = save_outputs(grouped_articles, summary)
        print(build_console_summary(grouped_articles))
        print(f"\n{MSG_JSON_SAVED} {JSON_OUTPUT_FILE.resolve()}")
        if summary_path == TEXT_OUTPUT_FILE:
            print(f"{MSG_SUMMARY_SAVED} {summary_path.resolve()}")
        else:
            print(f"{MSG_SUMMARY_FALLBACK_SAVED} {summary_path.resolve()}")

    except HTTPError as error:
        handle_cached_fallback(f"{MSG_HTTP_ERROR}: {error.code} {error.reason}")
    except URLError as error:
        handle_cached_fallback(f"{MSG_NETWORK_ERROR}: {error.reason}")
    except OSError as error:
        if isinstance(error, PermissionError) or getattr(error, "winerror", None) == 10013:
            handle_cached_fallback(f"{MSG_NETWORK_ERROR}: {error}")
            return
        raise
    except FileNotFoundError as error:
        print(f"{MSG_FILE_NOT_FOUND}: {error.filename}")
    except Exception as error:
        print(f"{MSG_UNEXPECTED}: {error}")


if __name__ == "__main__":
    main()
