from typing import TypedDict, Optional
from langgraph.graph import StateGraph, START, END
from graph.agents import (
    guardian_agent,
    orchestrator_agent,
    compliance_agent,
    factcheck_agent,
    tone_agent,
    verdict_agent,
    fix_agent,
    memory_retrieve_agent,
    memory_save_agent,
)


# ──────────────────────────────────────────────
# State：贯穿整个 workflow 的共享数据结构
# ──────────────────────────────────────────────
class HalluScanState(TypedDict):
    # 输入
    text: str
    # Guardian 输出
    is_safe: bool
    guardian_reason: str
    # Orchestrator 输出
    content_type: str
    risk_summary: str
    # Phase 3：记忆检索结果（在并行三路之前注入）
    retrieved_memories: Optional[list]
    # 三路并行 Agent 输出
    compliance_result: Optional[dict]
    factcheck_result: Optional[dict]
    tone_result: Optional[dict]
    # Verdict 输出
    verdict: Optional[dict]
    # Fix 输出
    fixed_text: Optional[str]
    fix_changes: Optional[list]
    # Phase 3：记忆存储标记
    memory_saved: Optional[bool]


def route_after_guardian(state: HalluScanState) -> str:
    """Guardian 检测后的路由：安全则继续，不安全则直接结束。"""
    if not state.get("is_safe", True):
        return "blocked"
    return "orchestrator"


def build_graph() -> StateGraph:
    builder = StateGraph(HalluScanState)

    # 注册所有节点
    builder.add_node("guardian", guardian_agent)
    builder.add_node("orchestrator", orchestrator_agent)
    builder.add_node("memory_retrieve", memory_retrieve_agent)  # Phase 3
    builder.add_node("compliance", compliance_agent)
    builder.add_node("factcheck", factcheck_agent)
    builder.add_node("tone", tone_agent)
    builder.add_node("verdict", verdict_agent)
    builder.add_node("fix", fix_agent)
    builder.add_node("memory_save", memory_save_agent)          # Phase 3

    # 入口 → Guardian
    builder.add_edge(START, "guardian")

    # Guardian → 条件路由
    builder.add_conditional_edges(
        "guardian",
        route_after_guardian,
        {"orchestrator": "orchestrator", "blocked": END},
    )

    # Orchestrator → 记忆检索（顺序，检索结果供 Verdict 使用）
    builder.add_edge("orchestrator", "memory_retrieve")

    # 记忆检索 → 三路并行
    builder.add_edge("memory_retrieve", "compliance")
    builder.add_edge("memory_retrieve", "factcheck")
    builder.add_edge("memory_retrieve", "tone")

    # 三路并行 → Verdict（LangGraph 自动等待三路全部完成）
    builder.add_edge(["compliance", "factcheck", "tone"], "verdict")

    # Verdict → Fix → 记忆存储 → 结束
    builder.add_edge("verdict", "fix")
    builder.add_edge("fix", "memory_save")
    builder.add_edge("memory_save", END)

    return builder.compile()


# 全局单例，避免重复编译
graph = build_graph()
