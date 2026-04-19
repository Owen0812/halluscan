import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "config", ".env"))

import json
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from graph.workflow import graph
from memory.store import init_db
from observability.tracer import get_callback_handler, update_trace, flush


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # 启动时建表（无 DATABASE_URL 时静默跳过）
    yield


app = FastAPI(title="HalluScan", version="0.4.0", lifespan=lifespan)

# 允许前端跨域访问（Phase 5 Next.js 需要）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 每个节点对应的中文标签，用于前端展示
NODE_META = {
    "guardian":         {"label": "安全检测",        "desc": "检测提示词注入风险"},
    "orchestrator":     {"label": "任务分析",        "desc": "识别文案类型，规划审核方向"},
    "memory_retrieve":  {"label": "记忆检索",        "desc": "检索历史相似案例，注入裁决上下文"},
    "compliance":       {"label": "广告法合规检测",  "desc": "扫描违规词，引用法规条款"},
    "factcheck":        {"label": "事实核查",        "desc": "搜索验证商品参数与功效声明"},
    "tone":             {"label": "夸大宣传分析",    "desc": "识别语义级过度宣传"},
    "verdict":          {"label": "综合裁决",        "desc": "汇总三路结果，给出最终判决"},
    "fix":              {"label": "生成合规文案",    "desc": "自动改写违规内容"},
    "memory_save":      {"label": "记忆更新",        "desc": "将本次审核结果存入长期记忆库"},
}


class ScanRequest(BaseModel):
    text: str


def _extract_summary(node: str, update: dict) -> dict:
    """从节点更新中提取对前端有用的摘要信息。"""
    if node == "guardian":
        return {"is_safe": update.get("is_safe")}
    if node == "orchestrator":
        return {"content_type": update.get("content_type")}
    if node == "compliance":
        r = update.get("compliance_result", {})
        return {"violation_count": len(r.get("violations", [])), "risk_level": r.get("risk_level")}
    if node == "factcheck":
        r = update.get("factcheck_result", {})
        return {"claim_count": len(r.get("claims", [])), "risk_level": r.get("risk_level")}
    if node == "tone":
        r = update.get("tone_result", {})
        return {"exaggeration_count": len(r.get("exaggerations", [])), "risk_level": r.get("risk_level")}
    if node == "verdict":
        r = update.get("verdict", {})
        return {"verdict": r.get("verdict"), "overall_risk": r.get("overall_risk"), "summary": r.get("summary")}
    if node == "fix":
        return {"fixed_text": update.get("fixed_text"), "changes": update.get("fix_changes", [])}
    if node == "memory_retrieve":
        return {"memory_count": len(update.get("retrieved_memories") or [])}
    if node == "memory_save":
        return {"saved": update.get("memory_saved", False)}
    return {}


# ──────────────────────────────────────────────
# SSE 流式端点：实时推送每个 Agent 的执行进度
# ──────────────────────────────────────────────
@app.post("/scan/stream")
async def scan_stream(req: ScanRequest):
    async def event_generator():
        session_id = str(uuid.uuid4())
        handler = get_callback_handler(session_id=session_id)
        callbacks = [handler] if handler else []

        # 发送开始事件，附带 session_id 方便前端联动 Langfuse
        yield _sse({"event": "start", "text": req.text, "session_id": session_id})

        # 收集关键字段用于事后更新 Langfuse Trace 元数据
        trace_meta = {"content_type": None, "verdict": None,
                      "risk_level": None, "memory_count": 0}

        async for chunk in graph.astream(
            {"text": req.text},
            config={"callbacks": callbacks},   # Langfuse 自动追踪所有 LLM 调用
            stream_mode="updates",
        ):
            for node_name, update in chunk.items():
                meta = NODE_META.get(node_name, {"label": node_name, "desc": ""})
                summary = _extract_summary(node_name, update)
                payload = {
                    "event": "node_complete",
                    "node": node_name,
                    "label": meta["label"],
                    "desc": meta["desc"],
                    "data": summary,
                }
                yield _sse(payload)

                # 收集元数据
                if node_name == "orchestrator":
                    trace_meta["content_type"] = update.get("content_type")
                if node_name == "memory_retrieve":
                    trace_meta["memory_count"] = summary.get("memory_count", 0)
                if node_name == "verdict":
                    r = update.get("verdict", {})
                    trace_meta["verdict"] = r.get("verdict")
                    trace_meta["risk_level"] = r.get("overall_risk")

                # Guardian 判为不安全时，提前通知前端终止
                if node_name == "guardian" and not update.get("is_safe", True):
                    yield _sse({"event": "blocked", "reason": update.get("guardian_reason", "")})
                    flush()
                    return

        # 审核完成后把结构化结果写入 Langfuse Trace 元数据
        update_trace(handler, **trace_meta)
        flush()

        yield _sse({"event": "done"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    """把字典序列化为标准 SSE 格式：data: {...}\n\n"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ──────────────────────────────────────────────
# 同步端点（保留，方便脚本直接调用）
# ──────────────────────────────────────────────
@app.post("/scan")
def scan(req: ScanRequest):
    session_id = str(uuid.uuid4())
    handler = get_callback_handler(session_id=session_id)
    callbacks = [handler] if handler else []

    result = graph.invoke(
        {"text": req.text},
        config={"callbacks": callbacks},
    )

    verdict = result.get("verdict") or {}
    update_trace(
        handler,
        content_type=result.get("content_type"),
        verdict=verdict.get("verdict"),
        risk_level=verdict.get("overall_risk"),
    )
    flush()

    return {
        "input_text": req.text,
        "session_id": session_id,
        "content_type": result.get("content_type"),
        "is_safe": result.get("is_safe"),
        "verdict": verdict,
        "fixed_text": result.get("fixed_text"),
        "fix_changes": result.get("fix_changes"),
    }


@app.post("/scan/debug")
def scan_debug(req: ScanRequest):
    """返回所有中间 Agent 结果，用于调试。"""
    result = graph.invoke({"text": req.text})
    return {
        "compliance_result": result.get("compliance_result"),
        "factcheck_result":  result.get("factcheck_result"),
        "tone_result":       result.get("tone_result"),
        "verdict":           result.get("verdict"),
    }


@app.get("/health")
def health():
    return {"status": "ok"}
