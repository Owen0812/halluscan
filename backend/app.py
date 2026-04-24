import json
import os
import sys
import uuid
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from graph.workflow import graph
from memory.store import init_db
from observability.tracer import flush, get_callback_handler, update_trace

load_dotenv(os.path.join(os.path.dirname(__file__), "config", ".env"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def _cors_origins() -> list[str]:
    raw = os.getenv("HALLUSCAN_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="HalluScan", version="0.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

NODE_META = {
    "guardian": {"label": "安全检测", "desc": "检测提示词注入风险"},
    "orchestrator": {"label": "任务分析", "desc": "识别文案类型，规划审核方向"},
    "memory_retrieve": {"label": "记忆检索", "desc": "检索历史相似案例，注入裁决上下文"},
    "compliance": {"label": "广告法合规检测", "desc": "扫描违规词并引用法规条款"},
    "factcheck": {"label": "事实核查", "desc": "搜索验证商品参数与功效声明"},
    "tone": {"label": "夸大宣传分析", "desc": "识别语义级过度宣传"},
    "verdict": {"label": "综合裁决", "desc": "汇总三路结果，给出最终判断"},
    "fix": {"label": "生成合规文案", "desc": "自动改写违规内容"},
    "memory_save": {"label": "记忆更新", "desc": "将本次审核结果存入长期记忆库"},
}

NEXT_NODES = {
    "guardian": ["orchestrator"],
    "orchestrator": ["memory_retrieve"],
    "memory_retrieve": ["compliance", "factcheck", "tone"],
    "verdict": ["fix"],
    "fix": ["memory_save"],
}
PARALLEL_NODES = {"compliance", "factcheck", "tone"}


class ScanRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("text must not be blank")
        return cleaned


def _extract_summary(node: str, update: dict) -> dict:
    if node == "guardian":
        return {"is_safe": update.get("is_safe")}
    if node == "orchestrator":
        return {"content_type": update.get("content_type")}
    if node == "compliance":
        result = update.get("compliance_result", {})
        return {"violation_count": len(result.get("violations", [])), "risk_level": result.get("risk_level")}
    if node == "factcheck":
        result = update.get("factcheck_result", {})
        return {"claim_count": len(result.get("claims", [])), "risk_level": result.get("risk_level")}
    if node == "tone":
        result = update.get("tone_result", {})
        return {"exaggeration_count": len(result.get("exaggerations", [])), "risk_level": result.get("risk_level")}
    if node == "verdict":
        result = update.get("verdict", {})
        return {"verdict": result.get("verdict"), "overall_risk": result.get("overall_risk"), "summary": result.get("summary")}
    if node == "fix":
        return {"fixed_text": update.get("fixed_text"), "changes": update.get("fix_changes", [])}
    if node == "memory_retrieve":
        return {"memory_count": len(update.get("retrieved_memories") or [])}
    if node == "memory_save":
        return {"saved": update.get("memory_saved", False)}
    return {}


def _node_event(event: str, node: str, data: dict | None = None) -> dict:
    meta = NODE_META.get(node, {"label": node, "desc": ""})
    return {
        "event": event,
        "node": node,
        "label": meta["label"],
        "desc": meta["desc"],
        "data": data or {},
    }


@app.post("/scan/stream")
async def scan_stream(req: ScanRequest):
    async def event_generator():
        session_id = str(uuid.uuid4())
        handler = get_callback_handler(session_id=session_id)
        callbacks = [handler] if handler else []
        started = set()
        completed = set()
        trace_meta = {"content_type": None, "verdict": None, "risk_level": None, "memory_count": 0}

        def start_node(node: str):
            if node in started:
                return None
            started.add(node)
            return _sse(_node_event("node_start", node))

        try:
            yield _sse({"event": "start", "text": req.text, "session_id": session_id})
            first = start_node("guardian")
            if first:
                yield first

            async for chunk in graph.astream(
                {"text": req.text},
                config={"callbacks": callbacks},
                stream_mode="updates",
            ):
                for node_name, update in chunk.items():
                    if node_name not in started:
                        yield _sse(_node_event("node_start", node_name))
                        started.add(node_name)

                    summary = _extract_summary(node_name, update)
                    yield _sse(_node_event("node_complete", node_name, summary))
                    completed.add(node_name)

                    if node_name == "orchestrator":
                        trace_meta["content_type"] = update.get("content_type")
                    elif node_name == "memory_retrieve":
                        trace_meta["memory_count"] = summary.get("memory_count", 0)
                    elif node_name == "verdict":
                        result = update.get("verdict", {})
                        trace_meta["verdict"] = result.get("verdict")
                        trace_meta["risk_level"] = result.get("overall_risk")

                    if node_name == "guardian" and not update.get("is_safe", True):
                        yield _sse({"event": "blocked", "reason": update.get("guardian_reason", "")})
                        flush()
                        return

                    if PARALLEL_NODES.issubset(completed):
                        next_nodes = ["verdict"]
                    else:
                        next_nodes = NEXT_NODES.get(node_name, [])

                    for next_node in next_nodes:
                        event = start_node(next_node)
                        if event:
                            yield event

            update_trace(handler, **trace_meta)
            flush()
            yield _sse({"event": "done"})
        except Exception as exc:
            print(f"[API] stream failed: {exc}")
            flush()
            yield _sse({"event": "error", "message": "审核流程异常，请稍后重试"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/scan")
async def scan(req: ScanRequest):
    session_id = str(uuid.uuid4())
    handler = get_callback_handler(session_id=session_id)
    callbacks = [handler] if handler else []

    try:
        result = await graph.ainvoke({"text": req.text}, config={"callbacks": callbacks})
    except Exception as exc:
        print(f"[API] scan failed: {exc}")
        raise HTTPException(status_code=500, detail="审核流程异常，请稍后重试") from exc

    verdict = result.get("verdict") or {}
    update_trace(
        handler,
        content_type=result.get("content_type"),
        verdict=verdict.get("verdict"),
        risk_level=verdict.get("overall_risk"),
        memory_count=len(result.get("retrieved_memories") or []),
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
async def scan_debug(req: ScanRequest):
    result = await graph.ainvoke({"text": req.text})
    return {
        "compliance_result": result.get("compliance_result"),
        "factcheck_result": result.get("factcheck_result"),
        "tone_result": result.get("tone_result"),
        "verdict": result.get("verdict"),
    }


@app.get("/health")
def health():
    return {"status": "ok"}
