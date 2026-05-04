import json
import mimetypes
import psycopg2
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse
from pg_config import PG_CONFIG


BASE_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000
LOG_PATH = BASE_DIR / "openalex_server.runtime.log"


def log(message):
    text = str(message)
    if sys.stdout:
        print(text)
    else:
        with LOG_PATH.open("a", encoding="utf-8") as file:
            file.write(text + "\n")


def get_conn():
    try:
        return psycopg2.connect(**PG_CONFIG)
    except UnicodeDecodeError as exc:
        try:
            msg = exc.object.decode("cp1251")
        except Exception:
            msg = repr(exc.object)
        raise Exception(msg) from None


def read_rows(cur, sql, params=()):
    cur.execute(sql, params)
    cols = [desc[0] for desc in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def uniq(values):
    result = []
    seen = set()
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def group_by(rows, key):
    grouped = {}
    for row in rows:
        grouped.setdefault(row[key], []).append(row)
    return grouped


def load_articles_from_db():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            publications = read_rows(
                cur,
                """
                SELECT p.publication_id, p.openalex_id, p.title,
                       p.publication_year, p.abstract, p.doi,
                       COALESCE(j.name, 'Без журнала') AS journal_name
                FROM publications p
                LEFT JOIN journals j ON j.journal_id = p.journal_id
                ORDER BY p.publication_year DESC NULLS LAST, LOWER(p.title)
                """,
            )
            authors = read_rows(
                cur,
                """
                SELECT pa.publication_id, pa.author_position, pe.full_name
                FROM publication_authors pa
                JOIN persons pe ON pe.person_id = pa.person_id
                ORDER BY pa.publication_id, pa.author_position
                """,
            )
            affiliations = read_rows(
                cur,
                """
                SELECT DISTINCT pa.publication_id,
                       a.institution, a.latitude, a.longitude
                FROM affiliations a
                JOIN publication_authors pa ON pa.person_id = a.person_id
                WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL
                ORDER BY pa.publication_id
                """,
            )
            topics = read_rows(
                cur,
                """
                SELECT publication_id, topic_name
                FROM publication_topics
                ORDER BY publication_id, score DESC NULLS LAST
                """,
            )
            keywords = read_rows(
                cur,
                """
                SELECT publication_id, keyword_name
                FROM publication_keywords
                ORDER BY publication_id, score DESC NULLS LAST
                """,
            )
    finally:
        conn.close()

    authors_by_pub = group_by(authors, "publication_id")
    affiliations_by_pub = group_by(affiliations, "publication_id")
    topics_by_pub = group_by(topics, "publication_id")
    keywords_by_pub = group_by(keywords, "publication_id")

    articles = []
    for pub in publications:
        pub_id = pub["publication_id"]
        article_id = pub["openalex_id"] or str(pub_id)

        article_affiliations = []
        seen_affiliations = set()
        for item in affiliations_by_pub.get(pub_id, []):
            if len(article_affiliations) >= 5:
                break
            place = item["institution"] or "Неизвестная аффилиация"
            lat = item["latitude"]
            lon = item["longitude"]
            key = (place, lat, lon)
            if key in seen_affiliations:
                continue
            seen_affiliations.add(key)
            article_affiliations.append({"place": place, "lat": lat, "lon": lon})

        articles.append(
            {
                "id": article_id,
                "title": pub["title"] or "Без названия",
                "year": pub["publication_year"],
                "journal": pub["journal_name"],
                "authors": uniq(
                    row["full_name"]
                    for row in authors_by_pub.get(pub_id, [])
                ),
                "topics": uniq(
                    row["topic_name"]
                    for row in topics_by_pub.get(pub_id, [])
                ),
                "keywords": uniq(
                    row["keyword_name"]
                    for row in keywords_by_pub.get(pub_id, [])
                ),
                "affiliations": article_affiliations,
            }
        )

    return articles


def load_article_detail(article_id):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            rows = read_rows(
                cur,
                """
                SELECT p.publication_id, p.openalex_id, p.abstract, p.doi,
                       p.title, p.publication_year,
                       COALESCE(j.name, 'Без журнала') AS journal_name
                FROM publications p
                LEFT JOIN journals j ON j.journal_id = p.journal_id
                WHERE p.openalex_id = %s OR CAST(p.publication_id AS TEXT) = %s
                LIMIT 1
                """,
                (article_id, article_id),
            )
            if not rows:
                return {"error": "not found"}
            pub = rows[0]
            return {
                "id": article_id,
                "abstractText": pub["abstract"] or "",
                "doi": pub["doi"] or "",
            }
    finally:
        conn.close()


def load_stats():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM journals")
            j = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM publications")
            p = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM persons")
            pe = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM affiliations")
            a = cur.fetchone()[0]
    finally:
        conn.close()
    return {"journals": j, "publications": p, "persons": pe, "affiliations": a}


def load_data_tables():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            result = {
                "journals": read_rows(
                    cur,
                    "SELECT * FROM journals ORDER BY LOWER(name)",
                ),
                "publications": read_rows(
                    cur,
                    """
                    SELECT p.*, COALESCE(j.name, '') AS journal_name
                    FROM publications p
                    LEFT JOIN journals j ON j.journal_id = p.journal_id
                    ORDER BY p.publication_year DESC NULLS LAST, LOWER(p.title)
                    """,
                ),
                "persons": read_rows(
                    cur,
                    "SELECT * FROM persons ORDER BY LOWER(full_name)",
                ),
                "affiliations": read_rows(
                    cur,
                    "SELECT * FROM affiliations ORDER BY person_id, affiliation_id",
                ),
                "publicationTopics": read_rows(
                    cur,
                    "SELECT * FROM publication_topics ORDER BY publication_id, score DESC NULLS LAST",
                ),
                "publicationKeywords": read_rows(
                    cur,
                    "SELECT * FROM publication_keywords ORDER BY publication_id, score DESC NULLS LAST",
                ),
                "publicationAuthors": read_rows(
                    cur,
                    "SELECT * FROM publication_authors ORDER BY publication_id, author_position",
                ),
            }
    finally:
        conn.close()

    result["graphNodes"] = load_json_file(BASE_DIR / "openalex_data" / "graph_data" / "nodes_all.json")
    result["graphEdges"] = load_json_file(BASE_DIR / "openalex_data" / "graph_data" / "edges_all.json")
    return result


def load_json_file(path):
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


class OpenAlexHandler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def send_text(self, text, status=200):
        data = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/articles":
            try:
                self.send_json(load_articles_from_db())
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if path.startswith("/api/article/"):
            article_id = unquote(path[len("/api/article/"):])
            try:
                self.send_json(load_article_detail(article_id))
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if path == "/api/stats":
            try:
                self.send_json(load_stats())
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if path == "/api/data-tables":
            try:
                self.send_json(load_data_tables())
            except Exception as error:
                self.send_json({"error": str(error)}, status=500)
            return

        if path in {"/", ""}:
            self.send_response(302)
            self.send_header("Location", "/interface/VKR1.html")
            self.end_headers()
            return

        target = (BASE_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(BASE_DIR.resolve())):
            self.send_text("Forbidden", status=403)
            return

        if not target.exists() or not target.is_file():
            self.send_text("Not found", status=404)
            return

        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
            ".csv": "text/csv; charset=utf-8",
        }.get(target.suffix.lower()) or mimetypes.guess_type(target.name)[0] or "application/octet-stream"

        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        log("%s - %s" % (self.address_string(), format % args))


def main():
    try:
        conn = get_conn()
        conn.close()
    except Exception as error:
        raise SystemExit(f"Не удаётся подключиться к PostgreSQL: {error}")

    server = ThreadingHTTPServer((HOST, PORT), OpenAlexHandler)
    log(f"Сервер запущен: http://{HOST}:{PORT}/VKR1.html")
    log("API статей: http://127.0.0.1:8000/api/articles")
    log("Остановить сервер: Ctrl+C")
    server.serve_forever()


if __name__ == "__main__":
    main()
