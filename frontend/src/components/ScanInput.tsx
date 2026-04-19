"use client";

import { useAppStore } from "@/lib/store";

const DEMO_TEXT = `本品采用顶级纳米技术，经临床100%验证，7天内必然美白祛斑效果绝对第一，全球销量最高，无任何副作用，比同类产品功效提升300%，史上最强护肤品，永久保湿效果持续终身。`;

export default function ScanInput({ fillHeight = false }: { fillHeight?: boolean }) {
  const { inputText, setInputText, startScan, phase, newScan } = useAppStore();
  const isScanning = phase === "scanning";

  return (
    <div className={`flex flex-col gap-2.5 ${fillHeight ? "flex-1 h-full" : ""}`}>
      {/* Textarea */}
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") startScan();
        }}
        placeholder="粘贴需要审核的营销文案..."
        rows={3}
        disabled={isScanning}
        className={`w-full p-3.5 text-sm resize-none transition-all duration-200 disabled:opacity-50 ${
          fillHeight ? "flex-1 min-h-0" : ""
        }`}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          color: "var(--text)",
          outline: "none",
          fontFamily: "inherit",
          lineHeight: "1.6",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "rgba(15,139,141,0.40)";
          e.target.style.boxShadow = "0 0 0 3px rgba(15,139,141,0.08)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "var(--border)";
          e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        }}
      />

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setInputText(DEMO_TEXT)}
            className="text-xs font-medium transition-opacity"
            style={{ color: "var(--teal)" }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "0.65")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "1")}
          >
            填入示例
          </button>
          {inputText.length > 0 && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {inputText.length} 字符
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {phase !== "idle" && (
            <button onClick={newScan} disabled={isScanning} className="btn-ghost px-3 py-1.5 text-xs">
              重置
            </button>
          )}
          <button
            onClick={startScan}
            disabled={isScanning || !inputText.trim()}
            className="btn-primary px-4 py-1.5 gap-1.5"
          >
            {isScanning ? (
              <>
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(255,255,255,0.30)", borderTopColor: "#fff" }}
                />
                审核中…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                开始审核
              </>
            )}
          </button>
        </div>
      </div>

      {/* Caption */}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        支持广告法合规检测、事实核查和夸大宣传分析 · Ctrl+Enter 发送
      </p>
    </div>
  );
}
