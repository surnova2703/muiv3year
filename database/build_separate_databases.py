"""
build_separate_databases.py — загрузка данных из article_data.json в PostgreSQL.

Запуск:
    python setup_pg_database.py   # создать таблицы (один раз)
    python build_separate_databases.py
"""
import sys
import ijson
import psycopg2
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pg_config import PG_CONFIG

BASE_DIR = ROOT
JSON_PATH = ROOT / "article_data.json"


def openalex_short_id(value):
    result = str(value or "").replace("https://openalex.org/", "")
    return result or None


def decode_abstract(index):
    if not isinstance(index, dict):
        return ""
    words = []
    for token, positions in index.items():
        if not isinstance(positions, list):
            continue
        for position in positions:
            if isinstance(position, int) and position >= 0:
                while len(words) <= position:
                    words.append("")
                words[position] = token
    return " ".join(word for word in words if word)


def get_journal_info(article, fallback):
    primary_location = article.get("primary_location") or {}
    source = primary_location.get("source") or {}
    return {
        "openalex_id": openalex_short_id(source.get("id")),
        "name": (
            source.get("display_name")
            or primary_location.get("raw_source_name")
            or fallback
            or "Без журнала"
        ),
        "issn": source.get("issn_l"),
        "publisher": source.get("host_organization_name"),
    }


def get_or_insert_journal(cur, info):
    openalex_id = info["openalex_id"]
    name = info["name"]

    if openalex_id:
        cur.execute(
            """
            INSERT INTO journals (openalex_id, name, issn, publisher)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (openalex_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING journal_id
            """,
            (openalex_id, name, info["issn"], info["publisher"]),
        )
        return cur.fetchone()[0]

    cur.execute(
        "SELECT journal_id FROM journals WHERE name = %s AND openalex_id IS NULL LIMIT 1",
        (name,),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        "INSERT INTO journals (name, issn, publisher) VALUES (%s, %s, %s) RETURNING journal_id",
        (name, info["issn"], info["publisher"]),
    )
    return cur.fetchone()[0]


def get_or_insert_publication(cur, article, journal_id):
    openalex_id = openalex_short_id(
        article.get("id")
        or (article.get("ids") or {}).get("openalex")
    )
    title = article.get("title") or article.get("display_name") or "Без названия"
    doi = article.get("doi") or None
    year = article.get("publication_year") or article.get("year")
    pub_type = article.get("type")
    cited = article.get("cited_by_count", 0) or 0
    abstract = (
        article.get("abstract")
        or article.get("abstractText")
        or decode_abstract(article.get("abstract_inverted_index"))
    ) or None

    if openalex_id:
        cur.execute("SAVEPOINT pub_save")
        try:
            cur.execute(
                """
                INSERT INTO publications
                    (openalex_id, title, doi, publication_year, publication_type,
                     cited_by_count, abstract, journal_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (openalex_id) DO UPDATE SET cited_by_count = EXCLUDED.cited_by_count
                RETURNING publication_id
                """,
                (openalex_id, title, doi, year, pub_type, cited, abstract, journal_id),
            )
            pub_id = cur.fetchone()[0]
            cur.execute("RELEASE SAVEPOINT pub_save")
            return pub_id
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT pub_save")
            # doi collision with a different openalex record — look up by openalex_id then doi
            cur.execute("SELECT publication_id FROM publications WHERE openalex_id = %s", (openalex_id,))
            row = cur.fetchone()
            if row:
                return row[0]
            if doi:
                cur.execute("SELECT publication_id FROM publications WHERE doi = %s", (doi,))
                row = cur.fetchone()
                if row:
                    return row[0]
            # last resort: insert without doi
            cur.execute(
                """
                INSERT INTO publications
                    (openalex_id, title, publication_year, publication_type,
                     cited_by_count, abstract, journal_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (openalex_id) DO UPDATE SET cited_by_count = EXCLUDED.cited_by_count
                RETURNING publication_id
                """,
                (openalex_id, title, year, pub_type, cited, abstract, journal_id),
            )
            return cur.fetchone()[0]

    if doi:
        cur.execute("SAVEPOINT pub_save")
        try:
            cur.execute(
                """
                INSERT INTO publications
                    (title, doi, publication_year, publication_type,
                     cited_by_count, abstract, journal_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (doi) DO UPDATE SET cited_by_count = EXCLUDED.cited_by_count
                RETURNING publication_id
                """,
                (title, doi, year, pub_type, cited, abstract, journal_id),
            )
            pub_id = cur.fetchone()[0]
            cur.execute("RELEASE SAVEPOINT pub_save")
            return pub_id
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT pub_save")
            cur.execute("SELECT publication_id FROM publications WHERE doi = %s", (doi,))
            row = cur.fetchone()
            if row:
                return row[0]
            cur.execute(
                """
                INSERT INTO publications
                    (title, publication_year, publication_type, cited_by_count, abstract, journal_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING publication_id
                """,
                (title, year, pub_type, cited, abstract, journal_id),
            )
            return cur.fetchone()[0]

    cur.execute(
        """
        INSERT INTO publications
            (title, publication_year, publication_type, cited_by_count, abstract, journal_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING publication_id
        """,
        (title, year, pub_type, cited, abstract, journal_id),
    )
    return cur.fetchone()[0]


def get_or_insert_person(cur, openalex_id, full_name, orcid):
    if openalex_id:
        cur.execute(
            """
            INSERT INTO persons (openalex_id, full_name, orcid)
            VALUES (%s, %s, %s)
            ON CONFLICT (openalex_id) DO UPDATE SET full_name = EXCLUDED.full_name
            RETURNING person_id
            """,
            (openalex_id, full_name, orcid or None),
        )
        return cur.fetchone()[0]

    cur.execute(
        "INSERT INTO persons (full_name) VALUES (%s) RETURNING person_id",
        (full_name,),
    )
    return cur.fetchone()[0]


def insert_affiliation_if_new(cur, person_id, institution_id, institution, country, lat, lon):
    cur.execute(
        "SELECT affiliation_id FROM affiliations WHERE person_id = %s AND institution = %s LIMIT 1",
        (person_id, institution),
    )
    if cur.fetchone():
        return
    cur.execute(
        """
        INSERT INTO affiliations
            (person_id, institution_id, institution, country, latitude, longitude)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (person_id, institution_id, institution, country, lat, lon),
    )


def insert_publication_authors_and_affiliations(cur, publication_id, article):
    for position, authorship in enumerate(article.get("authorships") or [], start=1):
        author = authorship.get("author") or {}
        person_openalex_id = openalex_short_id(author.get("id"))
        full_name = (
            author.get("display_name")
            or authorship.get("raw_author_name")
            or "Неизвестный автор"
        )
        person_id = get_or_insert_person(
            cur, person_openalex_id, full_name, author.get("orcid")
        )

        cur.execute(
            """
            INSERT INTO publication_authors (publication_id, person_id, author_position)
            VALUES (%s, %s, %s)
            ON CONFLICT (publication_id, person_id) DO UPDATE
                SET author_position = EXCLUDED.author_position
            """,
            (publication_id, person_id, position),
        )

        for inst in authorship.get("institutions") or []:
            inst_name = inst.get("display_name")
            if not inst_name:
                continue
            geo = inst.get("geo") or {}
            insert_affiliation_if_new(
                cur,
                person_id,
                openalex_short_id(inst.get("id")),
                inst_name,
                inst.get("country_code"),
                geo.get("latitude"),
                geo.get("longitude"),
            )

        for raw in authorship.get("raw_affiliation_strings") or []:
            if raw:
                insert_affiliation_if_new(cur, person_id, None, raw, None, None, None)


def insert_topics_and_keywords(cur, publication_id, article):
    for topic in article.get("topics") or []:
        topic_name = topic.get("display_name")
        if topic_name:
            cur.execute(
                "INSERT INTO publication_topics (publication_id, topic_name, score) VALUES (%s, %s, %s)",
                (publication_id, topic_name, topic.get("score")),
            )

    for keyword in article.get("keywords") or []:
        keyword_name = keyword.get("display_name")
        if keyword_name:
            cur.execute(
                "INSERT INTO publication_keywords (publication_id, keyword_name, score) VALUES (%s, %s, %s)",
                (publication_id, keyword_name, keyword.get("score")),
            )


def build_databases():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"Не найден файл {JSON_PATH}")

    conn = psycopg2.connect(**PG_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "TRUNCATE publication_keywords, publication_topics, publication_authors,"
                    " affiliations, publications, persons, journals RESTART IDENTITY"
                )
                with JSON_PATH.open("rb") as f:
                    for group in ijson.items(f, "item"):
                        fallback = group.get("journal") or "Без журнала"
                        for article in group.get("articles") or []:
                            journal_info = get_journal_info(article, fallback)
                            journal_id = get_or_insert_journal(cur, journal_info)
                            publication_id = get_or_insert_publication(cur, article, journal_id)
                            insert_publication_authors_and_affiliations(cur, publication_id, article)
                            insert_topics_and_keywords(cur, publication_id, article)

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


def main():
    counts = build_databases()
    print("Данные загружены в PostgreSQL:")
    for table, count in counts.items():
        print(f"  {table}: {count} записей")


if __name__ == "__main__":
    main()
