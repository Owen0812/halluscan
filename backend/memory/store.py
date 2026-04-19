"""
记忆系统核心模块：pgvector 语义检索 + BM25 全文检索 + RRF 排名融合。

无 DATABASE_URL 时所有函数静默返回空值，不影响主流程。
"""

import os
import json
import psycopg2
import psycopg2.extras

_conn = None
_emb_model = None


def _get_conn():
    global _conn
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return None
    try:
        if _conn is None or _conn.closed:
            _conn = psycopg2.connect(db_url)
            _conn.autocommit = True
        return _conn
    except Exception as e:
        print(f"[Memory] DB connection failed: {e}")
        return None


def _get_emb():
    """懒加载 DashScope text-embedding-v3（通过 OpenAI 兼容接口）。"""
    global _emb_model
    if _emb_model is None:
        from langchain_openai import OpenAIEmbeddings
        _emb_model = OpenAIEmbeddings(
            model="text-embedding-v3",
            openai_api_key=os.getenv("DASHSCOPE_API_KEY", ""),
            openai_api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
            # DashScope 只接受字符串，禁用 langchain 默认的 token 分片行为
            check_embedding_ctx_length=False,
        )
    return _emb_model


def _vec_to_literal(vector: list) -> str:
    """把 Python list 转成 pgvector 接受的字符串格式 '[0.1,0.2,...]'。"""
    return "[" + ",".join(str(v) for v in vector) + "]"


def init_db():
    """
    建表并创建索引，服务启动时调用一次。
    自动检测 embedding 维度，无需硬编码。
    """
    conn = _get_conn()
    if not conn:
        print("[Memory] No DATABASE_URL, memory system disabled")
        return

    try:
        # 通过试调用确定实际 embedding 维度
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
                    search_text   TSVECTOR
                )
            """)
            # ivfflat 索引（lists=10 适合小数据集，生产环境按数据量调大）
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
    except Exception as e:
        print(f"[Memory] DB init error: {e}")


def save_memory(state: dict) -> bool:
    """
    将一次完整审核结果蒸馏为结构化记忆对象存入数据库。
    只在 verdict 存在时写入，合规/违规/存疑均保存（全量学习）。
    """
    conn = _get_conn()
    if not conn:
        return False

    verdict = state.get("verdict") or {}
    verdict_text = verdict.get("verdict", "")
    if not verdict_text:
        return False

    industry = state.get("content_type", "其他")
    pattern = verdict.get("summary", "")
    law_refs = verdict.get("law_references") or []
    key_issues = verdict.get("key_issues") or []
    original_text = (state.get("text") or "")[:500]

    # 构建用于 embedding 和 BM25 检索的文本
    # 使用结构化字段而非原始文案，保证跨案例的语义一致性
    mem_text = f"{industry} {verdict_text} {pattern} {' '.join(key_issues)}"

    try:
        vector = _get_emb().embed_query(mem_text)
        vec_literal = _vec_to_literal(vector)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO audit_memories
                    (industry, pattern, verdict, law_refs, key_issues,
                     original_text, embedding, search_text)
                VALUES (%s, %s, %s, %s, %s, %s, %s::vector,
                        to_tsvector('simple', %s))
            """, (
                industry, pattern, verdict_text,
                law_refs, key_issues, original_text,
                vec_literal, mem_text,
            ))
        print(f"[Memory] Saved: [{verdict_text}] {industry} – {pattern[:40]}")
        return True
    except Exception as e:
        print(f"[Memory] save failed: {e}")
        return False


def retrieve_memories(text: str, top_k: int = 3) -> list:
    """
    混合检索历史案例：
      - pgvector  余弦相似度（语义层）Top-20
      - tsvector  BM25 关键词匹配（词法层）Top-20
      - RRF       Reciprocal Rank Fusion 融合，k=60
    返回 top_k 条最相关的历史案例，无结果或 DB 未配置时返回 []。
    """
    conn = _get_conn()
    if not conn:
        return []

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM audit_memories")
            if cur.fetchone()[0] == 0:
                return []

        vector = _get_emb().embed_query(text[:500])
        vec_literal = _vec_to_literal(vector)
        RRF_K = 60

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
            """, (vec_literal, text[:200], RRF_K, RRF_K, top_k))

            return [dict(r) for r in cur.fetchall()]

    except Exception as e:
        print(f"[Memory] retrieve failed: {e}")
        return []
