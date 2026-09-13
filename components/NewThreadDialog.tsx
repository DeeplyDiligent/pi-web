"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getRecentProjects } from "@/lib/project-groups";
import type { SessionInfo } from "@/lib/types";
import { DirectoryPicker } from "./DirectoryPicker";
import { ProjectPicker } from "./ProjectPicker";

export interface NewThreadWorkspace {
  cwd: string;
  projectRoot: string;
  projectKey: string;
}

export function NewThreadDialog({ sessions, currentCwd, onCancel, onSelect }: {
  sessions: readonly SessionInfo[];
  currentCwd: string | null;
  onCancel: () => void;
  onSelect: (workspace: NewThreadWorkspace) => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const requestRef = useRef<AbortController | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = useMemo(() => {
    const choices = getRecentProjects(sessions);
    // Include a fresh workspace or active worktree even before its first thread.
    if (currentCwd && !choices.some(({ root, key }) => root === currentCwd || key === currentCwd)) {
      choices.unshift({ root: currentCwd, key: currentCwd });
    }
    return choices;
  }, [sessions, currentCwd]);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (browsing) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = openerRef.current;
    dialog.showModal();
    dialog.querySelector("input")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [browsing]);

  const selectWorkspace = async (cwd: string) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
        signal: controller.signal,
      });
      const data = await response.json() as Partial<NewThreadWorkspace> & { error?: string };
      if (!response.ok || data.error || !data.cwd || !data.projectRoot || !data.projectKey) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      if (!controller.signal.aborted) {
        onSelect({ cwd: data.cwd, projectRoot: data.projectRoot, projectKey: data.projectKey });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  };

  if (browsing) {
    return (
      <div onKeyDown={(event) => event.stopPropagation()}>
        <DirectoryPicker initialPath={currentCwd ?? undefined} busy={busy} error={error} onSelect={(cwd) => void selectWorkspace(cwd)} onCancel={() => { setBrowsing(false); setError(null); }} />
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="new-thread-workspace-title"
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      onKeyDown={(event) => {
        // Escape must dismiss this dialog, not abort an agent behind it.
        event.stopPropagation();
      }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
      style={{ margin: "auto", padding: 0, width: 480, maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100dvh - 24px)", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", color: "var(--text)", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 26px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <h2 id="new-thread-workspace-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t("chat.chooseWorkspace")}</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label={t("chat.close")} style={{ width: 32, height: 32, border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        <ProjectPicker projects={projects} selectedKey={projects.find(({ root }) => root === currentCwd)?.key} disabled={busy} onSelect={(project) => void selectWorkspace(project.root)} />
        {error && <div role="alert" style={{ padding: "10px 16px", color: "#ef4444", fontSize: 12 }}>{error}</div>}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button type="button" disabled={busy} onClick={() => { setError(null); setBrowsing(true); }} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-hover)", color: "var(--text)", cursor: "pointer", fontSize: 12 }}>{t("sidebar.customPath")}</button>
        </div>
      </div>
    </dialog>
  );
}
