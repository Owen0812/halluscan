"""
Langfuse 可观测性模块（兼容 Langfuse v4 + OpenTelemetry 架构）。

无 LANGFUSE_PUBLIC_KEY / SECRET_KEY 时所有函数静默降级，不影响主流程。

每次 /scan 请求会产生一条 Trace，包含：
  - 每个 Agent 节点的耗时（Span）
  - 每次 LLM 调用的 prompt / response / token 消耗（Generation）
  - 本次审核的元数据（文案类型、最终判决）
"""

import os
import uuid

_lf_client = None


def _is_configured() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY")) and bool(os.getenv("LANGFUSE_SECRET_KEY"))


def _get_client():
    """懒加载 Langfuse 单例客户端。"""
    global _lf_client
    if _lf_client is not None:
        return _lf_client
    if not _is_configured():
        return None
    try:
        from langfuse import get_client
        _lf_client = get_client()
        return _lf_client
    except Exception as e:
        print(f"[Langfuse] Client init failed: {e}")
        return None


def get_callback_handler(session_id: str = None):
    """
    返回 LangChain/LangGraph 兼容的 CallbackHandler。
    v4 通过环境变量自动认证，trace_context 把本次调用关联到指定 trace_id。
    无配置时返回 None，调用方用空列表替代。
    """
    if not _is_configured():
        return None
    try:
        from langfuse import get_client
        from langfuse.langchain import CallbackHandler
        from langfuse.types import TraceContext

        lf = get_client()
        trace_id = lf.create_trace_id()   # 为本次请求生成全局唯一 trace_id

        handler = CallbackHandler(
            trace_context=TraceContext(trace_id=trace_id),
        )
        # 把 session_id 挂在 handler 上，方便后续读取
        handler._halluscan_session_id = session_id or str(uuid.uuid4())
        handler._halluscan_trace_id = trace_id
        return handler
    except Exception as e:
        print(f"[Langfuse] CallbackHandler init failed: {e}")
        return None


def get_trace_id(handler) -> str | None:
    """从 handler 拿 trace_id（兼容 v4 API）。"""
    if handler is None:
        return None
    # v4 用 last_trace_id 或我们自己存的 _halluscan_trace_id
    return getattr(handler, "_halluscan_trace_id", None) or getattr(handler, "last_trace_id", None)


def update_trace(handler, content_type: str = None, verdict: str = None,
                 risk_level: str = None, memory_count: int = 0):
    """
    审核完成后把结构化结果写入 Langfuse Trace。
    在 Langfuse 面板的 Trace 详情页可按 verdict / content_type 筛选。
    """
    if handler is None or not _is_configured():
        return
    try:
        lf = _get_client()
        if lf is None:
            return
        trace_id = get_trace_id(handler)
        if not trace_id:
            return
        # 写入分数（verdict 转数值方便聚合统计）
        verdict_score = {"违规": 0.0, "存疑": 0.5, "合规": 1.0}.get(verdict or "", -1.0)
        if verdict_score >= 0:
            lf.create_score(
                trace_id=trace_id,
                name="verdict_score",
                value=verdict_score,
                comment=f"{verdict} | {content_type} | risk={risk_level} | memory_hits={memory_count}",
            )
    except Exception as e:
        print(f"[Langfuse] update_trace failed: {e}")


def flush():
    """确保所有追踪数据已发送（在请求结束时调用）。"""
    lf = _get_client()
    if lf:
        try:
            lf.flush()
        except Exception:
            pass
