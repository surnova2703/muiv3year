"""
setup_pg_database.py — создаёт таблицы в PostgreSQL из db.sql.

Запуск (один раз перед build_separate_databases.py):
    pip install psycopg2-binary
    python setup_pg_database.py
"""
import sys
import psycopg2
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pg_config import PG_CONFIG

SQL_PATH = Path(__file__).resolve().parent / "db.sql"


def setup():
    sql = SQL_PATH.read_text(encoding="utf-8")
    conn = psycopg2.connect(**PG_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        print("Схема из db.sql успешно применена к PostgreSQL.")
    finally:
        conn.close()


if __name__ == "__main__":
    setup()
