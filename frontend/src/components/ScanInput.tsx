"use client";

import { useAppStore } from "@/lib/store";

const DEMO_TEXT = `本品采用顶级纳米技术，经临床100%验证，7天内必然美白祛斑效果绝对第一，全球销量最高，无任何副作用，比同类产品功效提升300%，史上最强护肤品，永久保湿效果持续终身。`;

export default function ScanInput() {
  const { inputText, setInputText, startScan, phase, reset } = useAppStore();
  const isScanning = phase === "scanning";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">输入营销文案</label>
        <button
          onClick={() => setInputText(DEMO_TEXT)}
          className="text-xs text-indigo-500 hover:text-indigo-700 underline"
        >
          填入示例
        </button>
      </div>

      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="粘贴需要审核的营销文案..."
        rows={6}
        disabled={isScanning}
        className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
      />

      <div className="flex gap-2">
        <button
          onClick={startScan}
          disabled={isScanning || !inputText.trim()}
          className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? "审核中..." : "开始审核"}
        </button>
        {phase !== "idle" && (
          <button
            onClick={reset}
            disabled={isScanning}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            重置
          </button>
        )}
      </div>
    </div>
  );
}
