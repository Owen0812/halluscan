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
  verdict: string;       // "违规" | "存疑" | "合规"
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

const NODE_ORDER = [
  "guardian",
  "orchestrator",
  "memory_retrieve",
  "compliance",
  "factcheck",
  "tone",
  "verdict",
  "fix",
  "memory_save",
];

interface AppState {
  phase: ScanPhase;
  inputText: string;
  nodes: AgentNode[];
  verdict: VerdictData | null;
  fix: FixData | null;
  blockedReason: string;
  errorMsg: string;
  setInputText: (t: string) => void;
  startScan: () => void;
  reset: () => void;
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

  const reset = useCallback(() => {
    setPhase("idle");
    setNodes([]);
    setVerdict(null);
    setFix(null);
    setBlockedReason("");
    setErrorMsg("");
  }, []);

  const startScan = useCallback(() => {
    if (!inputText.trim()) return;
    reset();
    setPhase("scanning");

    // Pre-populate node list in order so UI shows pipeline immediately
    setNodes(
      NODE_ORDER.map((n) => ({
        node: n,
        label: "",
        desc: "",
        status: "pending",
        data: {},
      }))
    );

    streamScan(inputText, {
      onEvent(e: SseEvent) {
        if (e.event === "start") return;

        if (e.event === "blocked") {
          setBlockedReason(e.reason);
          setPhase("blocked");
          return;
        }

        if (e.event === "done") {
          setPhase("done");
          return;
        }

        if (e.event === "node_complete") {
          const { node, label, desc, data } = e;

          setNodes((prev) =>
            prev.map((n) =>
              n.node === node
                ? { ...n, label, desc, status: "done", data }
                : n
            )
          );

          if (node === "verdict") {
            setVerdict({
              verdict: data.verdict as string,
              overall_risk: data.overall_risk as string,
              summary: data.summary as string,
            });
          }
          if (node === "fix") {
            setFix({
              fixed_text: data.fixed_text as string,
              changes: (data.changes as FixChange[]) ?? [],
            });
          }
        }
      },
      onError(err) {
        setErrorMsg(err.message);
        setPhase("error");
      },
    });
  }, [inputText, reset]);

  return (
    <AppContext.Provider
      value={{
        phase, inputText, nodes, verdict, fix,
        blockedReason, errorMsg,
        setInputText, startScan, reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used inside AppProvider");
  return ctx;
}
