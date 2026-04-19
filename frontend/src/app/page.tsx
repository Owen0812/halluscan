"use client";

import ScanInput from "@/components/ScanInput";
import AgentTimeline from "@/components/AgentTimeline";
import VerdictReport from "@/components/VerdictReport";
import { useAppStore } from "@/lib/store";

export default function Home() {
  const { phase } = useAppStore();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-none">HalluScan</h1>
            <p className="text-xs text-gray-400 mt-0.5">AI内容合规审核 · Multi-Agent</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: Input */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <ScanInput />

            {/* Error state */}
            {phase === "error" && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                连接后端失败，请确认后端已启动（端口 8000）
              </div>
            )}
          </div>

          {/* Right: Timeline + Report */}
          <div className="flex flex-col gap-6">
            {phase !== "idle" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <AgentTimeline />
              </div>
            )}

            {phase === "done" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <VerdictReport />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        HalluScan · LangGraph Multi-Agent · Phase 5
      </footer>
    </div>
  );
}
