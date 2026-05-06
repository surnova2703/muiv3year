"""
fetch_geo.py — получает координаты учреждений из OpenAlex API батчами
и записывает latitude/longitude в таблицу affiliations.
"""
import sys
import json
import time
import psycopg2
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pg_config import PG_CONFIG

CACHE_FILE = ROOT / "openalex_data" / "geo_cache.json"
BATCH_SIZE = 100
PAUSE = 0.5  # seconds between requests (OpenAlex polite limit)
USER_AGENT = "vkr-geo-enricher/1.0 (mailto:student@example.com)"


def get_conn():
    return psycopg2.connect(**PG_CONFIG)


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def fetch_batch(ids):
    """Fetch geo for a list of OpenAlex institution IDs in one request."""
    filter_str = "|".join(ids)
    params = urlencode({
        "filter": f"ids.openalex:{filter_str}",
        "select": "id,geo",
        "per_page": str(len(ids)),
    })
    url = f"https://api.openalex.org/institutions?{params}"
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    result = {}
    for item in data.get("results") or []:
        raw_id = item.get("id") or ""
        oa_id = raw_id.replace("https://openalex.org/", "")
        geo = item.get("geo") or {}
        result[oa_id] = {
            "lat": geo.get("latitude"),
            "lon": geo.get("longitude"),
        }
    return result


def get_unique_institution_ids(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT institution_id FROM affiliations "
            "WHERE institution_id IS NOT NULL AND institution_id <> ''"
        )
        return [row[0] for row in cur.fetchall()]


def update_db(conn, cache):
    updated = 0
    with conn:
        with conn.cursor() as cur:
            for inst_id, geo in cache.items():
                lat, lon = geo.get("lat"), geo.get("lon")
                if lat is None or lon is None:
                    continue
                cur.execute(
                    "UPDATE affiliations SET latitude = %s, longitude = %s "
                    "WHERE institution_id = %s AND latitude IS NULL",
                    (lat, lon, inst_id),
                )
                updated += cur.rowcount
    return updated


def main():
    cache = load_cache()
    conn = get_conn()

    all_ids = get_unique_institution_ids(conn)
    to_fetch = [i for i in all_ids if i not in cache]
    print(f"Unique institutions: {len(all_ids)}, need to fetch: {len(to_fetch)}")

    fetched = 0
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch = to_fetch[i:i + BATCH_SIZE]
        try:
            result = fetch_batch(batch)
            cache.update(result)
            # mark missing ones as None so we skip them next run
            for inst_id in batch:
                if inst_id not in cache:
                    cache[inst_id] = {"lat": None, "lon": None}
            fetched += len(result)
            print(f"  Batch {i // BATCH_SIZE + 1}: fetched {len(result)}/{len(batch)}")
        except Exception as e:
            print(f"  Batch {i // BATCH_SIZE + 1} error: {e}")
        save_cache(cache)
        time.sleep(PAUSE)

    print(f"\nTotal fetched from API: {fetched}")
    with_geo = sum(1 for v in cache.values() if v.get("lat") is not None)
    print(f"Cache entries with coordinates: {with_geo}")

    updated = update_db(conn, cache)
    conn.close()
    print(f"Database rows updated: {updated}")

    conn2 = get_conn()
    with conn2.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM affiliations WHERE latitude IS NOT NULL")
        print(f"Affiliations with coordinates now: {cur.fetchone()[0]}")
    conn2.close()


if __name__ == "__main__":
    main()
