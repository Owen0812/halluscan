import os

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool

_pool: SimpleConnectionPool | None = None
_emb_model = None


def _get_pool() -> SimpleConnectionPool | None:
    global _pool
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    if _pool is None:
        minconn = int(os.getenv("HALLUSCAN_DB_POOL_MIN", "1"))
        maxconn = int(os.getenv("HALLUSCAN_DB_POOL_MAX", "5"))
        try:
            _pool = SimpleConnectionPool(minconn, maxconn, db_url)
        except Exception as exc:
            print(f"[Memory] DB pool init failed: {exc}")
            return None
    return _pool


def _borrow_conn():
    pool = _get_pool()
    if pool is None:
        return None
    try:
        conn = pool.getconn()
        conn.autocommit = True
        return conn
    except Exception as exc:
        print(f"[Memory] DB connection failed: {exc}")
        return None


def _return_conn(conn) -> None:
    pool = _get_pool()
    if pool is not None and conn is not None:
        pool.putconn(conn)


def _get_emb():
    global _emb_model
    if _emb_model is None:
        from langchain_openai import OpenAIEmbeddings

        _emb_model = OpenAIEmbeddings(
            model=os.getenv("HALLUSCAN_EMBEDDING_MODEL", "text-embedding-v3"),
            openai_api_key=os.getenv("DASHSCOPE_API_KEY", ""),
            openai_api_base=os.getenv(
                "HALLUSCAN_OPENAI_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
            check_embedding_ctx_length=False,
        )
    return _emb_model


def _vec_to_literal(vector: list) -> str:
    return "[" + ",".join(str(v) for v in vector) + "]"


def init_db():
    conn = _borrow_conn()
    if not conn:
        print("[Memory] No DATABASE_URL, memory system disabled")
        return

    try:
        test_vec = _get_emb().embed_query("test")
        dim = len(test_vec)
        print(f"[Memory] Embedding dim = {dim}")

        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS audit_memories (
                    id            SERIAL PRIMARY KEY,
                    created_at    TIMESTAMPTZ DEFAULT NOW(),
                    industry      TEXT NOT NULL DEFAULT '其他',
                    pattern       TEXT NOT NULL DEFAULT '',
                    verdict       TEXT NOT NULL DEFAULT '',
                    law_refs      TEXT[] DEFAULT '{{}}',
                    key_issues    TEXT[] DEFAULT '{{}}',
                    original_text TEXT DEFAULT '',
                    embedding     VECTOR({dim}),
                    search_text   TSVECTOR,
                    dedupe_key    TEXT UNIQUE
                )
            """)
            cur.execute("ALTER TABLE audit_memories ADD COLUMN IF NOT EXISTS dedupe_key TEXT")
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS mem_dedupe_key_idx
                ON audit_memories (dedupe_key)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS mem_embedding_idx
                ON audit_memories USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 10)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS mem_fts_idx
                ON audit_memories USING GIN (search_text)
            """)
        print("[Memory] DB initialized")
    except Exception as exc:
        print(f"[Memory] DB init error: {exc}")
    finally:
        _return_conn(conn)


def save_memory(state: dict) -> bool:
    conn = _borrow_conn()
    if not conn:
        return False

    verdict = state.get("verdict") or {}
    verdict_text = verdict.get("verdict", "")
    if not verdict_text:
        _return_conn(conn)
        return False

    industry = state.get("content_type", "其他")
    pattern = verdict.get("summary", "")
    law_refs = verdict.get("law_references") or []
    key_issues = verdict.get("key_issues") or []
    original_text = (state.get("text") or "")[:500]
    mem_text = f"{industry} {verdict_text} {pattern} {' '.join(key_issues)}"
    dedupe_key = f"{industry}|{verdict_text}|{pattern[:120]}"

    try:
        vector = _get_emb().embed_query(mem_text)
        vec_literal = _vec_to_literal(vector)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO audit_memories
                    (industry, pattern, verdict, law_refs, key_issues,
                     original_text, embedding, search_text, dedupe_key)
                VALUES (%s, %s, %s, %s, %s, %s, %s::vector,
                        to_tsvector('simple', %s), %s)
                ON CONFLICT (dedupe_key) DO NOTHING
            """, (
                industry, pattern, verdict_text,
                law_refs, key_issues, original_text,
                vec_literal, mem_text, dedupe_key,
            ))
        print(f"[Memory] Saved: [{verdict_text}] {industry} - {pattern[:40]}")
        return True
    except Exception as exc:
        print(f"[Memory] save failed: {exc}")
        return False
    finally:
        _return_conn(conn)


def retrieve_memories(text: str, top_k: int = 3) -> list:
    conn = _borrow_conn()
    if not conn:
        return []

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM audit_memories")
            if cur.fetchone()[0] == 0:
                return []

        vector = _get_emb().embed_query(text[:500])
        vec_literal = _vec_to_literal(vector)
        rrf_k = int(os.getenv("HALLUSCAN_RRF_K", "60"))

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                WITH vec_ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY embedding <=> %s::vector
                           ) AS vec_rank
                    FROM audit_memories
                    LIMIT 20
                ),
                bm25_ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY ts_rank(search_text, q) DESC
                           ) AS bm25_rank
                    FROM audit_memories,
                         plainto_tsquery('simple', %s) AS q
                    WHERE search_text @@ q
                    LIMIT 20
                ),
                rrf AS (
                    SELECT
                        COALESCE(v.id, b.id) AS id,
                        1.0 / (%s::float + COALESCE(v.vec_rank,  1000)::float) +
                        1.0 / (%s::float + COALESCE(b.bm25_rank, 1000)::float) AS rrf_score
                    FROM vec_ranked v
                    FULL OUTER JOIN bm25_ranked b USING (id)
                )
                SELECT
                    m.industry, m.pattern, m.verdict,
                    m.law_refs, m.key_issues,
                    r.rrf_score
                FROM rrf r
                JOIN audit_memories m ON m.id = r.id
                ORDER BY r.rrf_score DESC
                LIMIT %s
            """, (vec_literal, text[:200], rrf_k, rrf_k, top_k))

            return [dict(r) for r in cur.fetchall()]

    except Exception as exc:
        print(f"[Memory] retrieve failed: {exc}")
        return []
    finally:
        _return_conn(conn)
