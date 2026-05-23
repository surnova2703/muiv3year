"""
fetch_geo_nominatim.py — геокодирование сырых строк аффилиаций через Nominatim.
Обрабатывает строки в порядке убывания охвата статей без координат.
"""
import json
import sys
import time
import psycopg2

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pg_config import PG_CONFIG

CACHE_FILE = ROOT / "openalex_data" / "nominatim_cache.json"
PAUSE = 0.3  # Photon is more lenient than Nominatim
USER_AGENT = "vkr-geo-enricher/1.0 (mailto:student@example.com)"


def get_conn():
    return psycopg2.connect(**PG_CONFIG)


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(
        json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


def nominatim_search(query):
    """Try progressively shorter versions of the query."""
    # Clean up tabs, extra spaces, numbered prefixes
    clean = query.replace("#TAB#", " ").replace("\t", " ").strip()
    parts = [p.strip() for p in clean.split(",") if p.strip()]
    if not parts:
        return None, None, None
    # Skip obviously non-geographic strings
    skip_words = {"physics", "biology", "chemistry", "mathematics", "medicine",
                  "department", "faculty", "laboratory", "school", "college",
                  "institute", "center", "centre"}
    if len(parts) == 1 and parts[0].lower() in skip_words:
        return None, None, None

    candidates = []
    candidates.append(clean)
    if len(parts) >= 3:
        candidates.append(", ".join(parts[-3:]))
    if len(parts) >= 2:
        candidates.append(", ".join(parts[-2:]))
    candidates.append(parts[0])

    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate or len(candidate) < 3:
            continue
        params = urlencode({"q": candidate, "limit": "1"})
        url = f"https://photon.komoot.io/api/?{params}"
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=15) as resp:
                data = json.load(resp)
            features = data.get("features") or []
            if features:
                coords = features[0]["geometry"]["coordinates"]
                return float(coords[1]), float(coords[0]), candidate  # GeoJSON: [lon, lat]
        except Exception:
            pass
        time.sleep(PAUSE)
    return None, None, None


def get_strings_to_geocode(conn):
    """Raw affiliation strings linked to publications that have no geo at all,
    ordered by number of publications they can unlock (descending)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT a.institution, COUNT(DISTINCT pa.publication_id) AS pub_count
            FROM affiliations a
            JOIN publication_authors pa ON pa.person_id = a.person_id
            WHERE a.institution_id IS NULL
              AND a.latitude IS NULL
              AND a.institution IS NOT NULL AND a.institution <> ''
              AND pa.publication_id IN (
                  SELECT DISTINCT p.publication_id
                  FROM publications p
                  WHERE NOT EXISTS (
                      SELECT 1 FROM publication_authors pa2
                      JOIN affiliations a2 ON a2.person_id = pa2.person_id
                      WHERE pa2.publication_id = p.publication_id
                        AND a2.latitude IS NOT NULL
                  )
              )
            GROUP BY a.institution
            ORDER BY pub_count DESC
        """)
        return [(row[0], row[1]) for row in cur.fetchall()]


def update_by_name(conn, institution, lat, lon):
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE affiliations SET latitude = %s, longitude = %s "
                "WHERE institution = %s AND latitude IS NULL",
                (lat, lon, institution),
            )
            return cur.rowcount


def count_covered(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(DISTINCT pa.publication_id)
            FROM publication_authors pa
            JOIN affiliations a ON a.person_id = pa.person_id
            WHERE a.latitude IS NOT NULL
        """)
        return cur.fetchone()[0]


def main():
    cache = load_cache()
    conn = get_conn()

    strings = get_strings_to_geocode(conn)
    print(f"Unique strings to geocode: {len(strings)}")
    print(f"Publications currently covered: {count_covered(conn)}/9994")
    print()

    total_updated_rows = 0
    found = 0
    failed = 0

    for i, (institution, pub_count) in enumerate(strings, 1):
        key = institution
        if key in cache:
            lat, lon = cache[key].get("lat"), cache[key].get("lon")
            if lat is not None:
                rows = update_by_name(conn, institution, lat, lon)
                total_updated_rows += rows
            continue

        lat, lon, matched = nominatim_search(institution)
        cache[key] = {"lat": lat, "lon": lon, "matched": matched}

        if lat is not None:
            rows = update_by_name(conn, institution, lat, lon)
            total_updated_rows += rows
            found += 1
            print(f"[{i}/{len(strings)}] +{pub_count} pubs | {institution[:60]} | {lat:.2f},{lon:.2f}")
        else:
            failed += 1
            if i % 50 == 0:
                print(f"[{i}/{len(strings)}] not found: {institution[:60]}")

        if i % 20 == 0:
            save_cache(cache)
            covered = count_covered(conn)
            print(f"  covered so far: {covered}/9994")

        time.sleep(PAUSE)

    save_cache(cache)
    covered = count_covered(conn)
    print(f"\nDone. Found: {found}, failed: {failed}")
    print(f"Affiliation rows updated: {total_updated_rows}")
    print(f"Publications with geo: {covered}/9994")


if __name__ == "__main__":
    main()
