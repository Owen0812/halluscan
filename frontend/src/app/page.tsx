"use client";

import { useAppStore, ScanRecord } from "@/lib/store";
import ScanInput from "@/components/ScanInput";
import AgentTimeline from "@/components/AgentTimeline";
import VerdictReport from "@/components/VerdictReport";

/* ── helpers ── */
function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const VERDICT_DOT: Record<string, string> = {
  违规: "var(--ember)",
  存疑: "var(--amber)",
  合规: "var(--green)",
};

/* ── sub-components ── */
function ScanLogo() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: "linear-gradient(135deg, rgba(15,139,141,0.15) 0%, rgba(15,139,141,0.08) 100%)",
          border: "1px solid var(--teal-border)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M8 11h3m0 0h3m-3 0V8m0 3v3" strokeWidth="2" />
        </svg>
      </div>
      <div>
        <div className="text-xs font-bold tracking-tight leading-none" style={{ color: "var(--text)" }}>HalluScan</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>AI 合规审核</div>
      </div>
    </div>
  );
}

function HistoryItem({
  scan, isActive, onSelect, onDelete,
}: { scan: ScanRecord; isActive: boolean; onSelect: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const title = scan.inputText.trim().slice(0, 22) + (scan.inputText.trim().length > 22 ? "…" : "");
  const dot = scan.phase === "blocked"
    ? "var(--ember)"
    : VERDICT_DOT[scan.verdict?.verdict ?? ""] ?? "var(--text-3)";

  return (
    <div
      onClick={onSelect}
      className="group relative px-3 py-2 rounded-lg cursor-pointer transition-colors"
      style={{ background: isActive ? "var(--card)" : "transparent", boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.07)" : "none" }}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div className="flex items-center gap-2 min-w-0 pr-5">
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
        <span className="text-xs font-medium truncate" style={{ color: isActive ? "var(--text)" : "var(--text-2)" }}>
          {title}
        </span>
      </div>
      <div className="text-xs mt-0.5 pl-3.5" style={{ color: "var(--text-3)" }}>
        {formatTime(scan.timestamp)}
      </div>

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex w-5 h-5 rounded items-center justify-center transition-colors"
        style={{ color: "var(--text-3)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ember)"; (e.currentTarget as HTMLElement).style.background = "var(--ember-dim)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

const FEATURES = [
  {
    label: "广告法合规",
    desc: "扫描违禁词与绝对化用语",
    color: "var(--teal)", bg: "var(--teal-dim)", border: "var(--teal-border)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  },
  {
    label: "事实核查",
    desc: "搜索验证功效与数据声明",
    color: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber-border)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  },
  {
    label: "夸大宣传",
    desc: "识别语义级过度宣传表述",
    color: "var(--ember)", bg: "var(--ember-dim)", border: "var(--ember-border)",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  },
];

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center py-12 animate-fadeIn">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--teal-dim)", border: "1px solid var(--teal-border)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold mb-1.5" style={{ color: "var(--text)" }}>开始合规审核</h2>
        <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-2)" }}>
          在下方输入营销文案，AI 将自动检测违规用语、虚假声明与夸大表述
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-2 w-full max-w-sm">
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="card p-3.5 text-left"
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center mb-2"
              style={{ background: f.bg, border: `1px solid ${f.border}`, color: f.color }}
            >
              {f.icon}
            </div>
            <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--text)" }}>{f.label}</div>
            <div className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main page ── */
export default function Home() {
  const { phase, inputText, history, activeHistoryId, loadHistoryScan, deleteHistoryScan, newScan } = useAppStore();

  const showContent = phase !== "idle" || activeHistoryId !== null;
  const currentTitle = activeHistoryId
    ? (history.find((h) => h.id === activeHistoryId)?.inputText.trim().slice(0, 35) ?? "…")
    : phase === "scanning" ? "审核中…"
    : phase === "done" || phase === "blocked" ? inputText.trim().slice(0, 35)
    : "就绪";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Left Sidebar ── */}
      <aside
        className="w-56 shrink-0 flex flex-col overflow-hidden border-r"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <ScanLogo />
        </div>

        {/* New Scan */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={newScan}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ border: "1px solid var(--border-2)", color: "var(--text-2)", background: "transparent" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-2)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建审核
          </button>
        </div>

        {/* History label */}
        <div className="px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            扫描记录
          </span>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {history.length === 0 ? (
            <div className="text-center py-8 text-xs" style={{ color: "var(--text-3)" }}>
              暂无历史记录
            </div>
          ) : (
            history.map((scan) => (
              <HistoryItem
                key={scan.id}
                scan={scan}
                isActive={scan.id === activeHistoryId}
                onSelect={() => loadHistoryScan(scan.id)}
                onDelete={(e) => { e.stopPropagation(); deleteHistoryScan(scan.id); }}
              />
            ))
          )}
        </div>

        {/* Sidebar footer */}
        <div className="px-4 py-3 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
          LangGraph · pgvector · Langfuse
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header
          className="shrink-0 px-6 py-3.5 border-b flex items-center justify-between"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-3)" }}>
              AUDIT RESULTS
            </div>
            <h1 className="text-sm font-semibold truncate max-w-sm" style={{ color: "var(--text)" }}>
              {currentTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {["LangGraph", "Multi-Agent"].map((t) => (
              <span
                key={t}
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: "var(--teal-dim)", border: "1px solid var(--teal-border)", color: "var(--teal)" }}
              >
                {t}
              </span>
            ))}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {showContent ? (
            <div className="max-w-2xl mx-auto flex flex-col gap-5 animate-fadeIn">
              <AgentTimeline />
              {phase === "done" && <VerdictReport />}
              {phase === "error" && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{ background: "var(--ember-dim)", border: "1px solid var(--ember-border)", color: "var(--ember)" }}
                >
                  连接后端失败，请确认后端已启动（端口 8000）
                </div>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Input footer */}
        <div
          className="shrink-0 border-t px-8 pt-4 pb-5"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <div className="max-w-2xl mx-auto">
            <ScanInput />
          </div>
        </div>
      </div>
    </div>
  );
}
