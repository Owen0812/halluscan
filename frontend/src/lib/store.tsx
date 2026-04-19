"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { streamScan, SseEvent } from "./api";

export type NodeStatus = "pending" | "running" | "done";

export interface AgentNode {
  node: string;
  label: string;
  desc: string;
  status: NodeStatus;
  data: Record<string, unknown>;
}

export interface VerdictData {
  verdict: string;
  overall_risk: string;
  summary: string;
}

export interface FixChange {
  original: string;
  fixed: string;
  reason: string;
}

export interface FixData {
  fixed_text: string;
  changes: FixChange[];
}

export type ScanPhase = "idle" | "scanning" | "blocked" | "done" | "error";

export interface ScanRecord {
  id: string;
  timestamp: number;
  inputText: string;
  phase: "done" | "blocked";
  nodes: AgentNode[];
  verdict: VerdictData | null;
  fix: FixData | null;
  blockedReason: string;
}

const NODE_ORDER = [
  "guardian", "orchestrator", "memory_retrieve",
  "compliance", "factcheck", "tone",
  "verdict", "fix", "memory_save",
];

interface AppState {
  phase: ScanPhase;
  inputText: string;
  nodes: AgentNode[];
  verdict: VerdictData | null;
  fix: FixData | null;
  blockedReason: string;
  errorMsg: string;
  history: ScanRecord[];
  activeHistoryId: string | null;
  setInputText: (t: string) => void;
  startScan: () => void;
  reset: () => void;
  newScan: () => void;
  loadHistoryScan: (id: string) => void;
  deleteHistoryScan: (id: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [inputText, setInputText] = useState("");
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [verdict, setVerdict] = useState<VerdictData | null>(null);
  const [fix, setFix] = useState<FixData | null>(null);
  const [blockedReason, setBlockedReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setNodes([]);
    setVerdict(null);
    setFix(null);
    setBlockedReason("");
    setErrorMsg("");
  }, []);

  const newScan = useCallback(() => {
    reset();
    setActiveHistoryId(null);
    setInputText("");
  }, [reset]);

  const loadHistoryScan = useCallback((id: string) => {
    setHistory((prev) => {
      const record = prev.find((h) => h.id === id);
      if (!record) return prev;
      setActiveHistoryId(id);
      setInputText(record.inputText);
      setNodes(record.nodes);
      setVerdict(record.verdict);
      setFix(record.fix);
      setBlockedReason(record.blockedReason);
      setPhase(record.phase);
      return prev;
    });
  }, []);

  const deleteHistoryScan = useCallback((id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
    setActiveHistoryId((prev) => {
      if (prev === id) {
        reset();
        return null;
      }
      return prev;
    });
  }, [reset]);

  const startScan = useCallback(() => {
    if (!inputText.trim()) return;

    const capturedInput = inputText;
    const scanId = Date.now().toString();

    reset();
    setPhase("scanning");
    setActiveHistoryId(null);

    const initialNodes = NODE_ORDER.map((n) => ({
      node: n, label: "", desc: "", status: "pending" as NodeStatus, data: {},
    }));
    setNodes(initialNodes);

    // Track latest values locally to avoid stale closure
    let localNodes = initialNodes;
    let localVerdict: VerdictData | null = null;
    let localFix: FixData | null = null;

    streamScan(capturedInput, {
      onEvent(e: SseEvent) {
        if (e.event === "start") return;

        if (e.event === "node_complete") {
          const { node, label, desc, data } = e;
          localNodes = localNodes.map((n) =>
            n.node === node ? { ...n, label, desc, status: "done", data } : n
          );
          setNodes([...localNodes]);

          if (node === "verdict") {
            localVerdict = {
              verdict: data.verdict as string,
              overall_risk: data.overall_risk as string,
              summary: data.summary as string,
            };
            setVerdict(localVerdict);
          }
          if (node === "fix") {
            localFix = {
              fixed_text: data.fixed_text as string,
              changes: (data.changes as FixChange[]) ?? [],
            };
            setFix(localFix);
          }
          return;
        }

        if (e.event === "blocked") {
          const reason = e.reason;
          setBlockedReason(reason);
          setPhase("blocked");
          const record: ScanRecord = {
            id: scanId, timestamp: parseInt(scanId),
            inputText: capturedInput, phase: "blocked",
            nodes: localNodes, verdict: localVerdict, fix: localFix, blockedReason: reason,
          };
          setHistory((prev) => [record, ...prev].slice(0, 30));
          setActiveHistoryId(scanId);
          return;
        }

        if (e.event === "done") {
          setPhase("done");
          const record: ScanRecord = {
            id: scanId, timestamp: parseInt(scanId),
            inputText: capturedInput, phase: "done",
            nodes: localNodes, verdict: localVerdict, fix: localFix, blockedReason: "",
          };
          setHistory((prev) => [record, ...prev].slice(0, 30));
          setActiveHistoryId(scanId);
        }
      },
      onError(err) {
        setErrorMsg(err.message);
        setPhase("error");
      },
    });
  }, [inputText, reset]);

  return (
    <AppContext.Provider value={{
      phase, inputText, nodes, verdict, fix,
      blockedReason, errorMsg, history, activeHistoryId,
      setInputText, startScan, reset, newScan,
      loadHistoryScan, deleteHistoryScan,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used inside AppProvider");
  return ctx;
}
