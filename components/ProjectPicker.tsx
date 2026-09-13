"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { filterProjects, type RecentProject } from "@/lib/project-groups";

export function displayCwd(cwd: string, homeDir?: string): string {
  return (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
}

/** Left-side ellipsis keeps trailing folder names visible without reordering paths. */
export function PathLabel({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", minWidth: 0, lineHeight: 1.35, direction: "rtl", textAlign: "left", ...style }}>
      <span style={{ unicodeBidi: "plaintext" }}>{text}</span>
    </span>
  );
}

/** Shared searchable workspace list for the sidebar and new-thread dialog. */
export function ProjectPicker({ projects, selectedKey, homeDir, onSelect, leading, renderActivity, disabled = false }: {
  projects: readonly RecentProject[];
  selectedKey?: string | null;
  homeDir?: string;
  onSelect: (project: RecentProject) => void;
  leading?: ReactNode;
  renderActivity?: (project: RecentProject) => ReactNode;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const visibleProjects = filterProjects(projects, query);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && visibleProjects.length === 1 && !disabled) {
              event.preventDefault();
              onSelect(visibleProjects[0]);
            }
          }}
          disabled={disabled}
          aria-label={t("sidebar.filterProjects")}
          placeholder={t("sidebar.filterProjects")}
          style={{ width: "100%", fontSize: 16, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ maxHeight: "min(50dvh, 380px)", overflowY: "auto", minHeight: 0 }}>
        {leading}
        {visibleProjects.map((project) => (
          <button
            key={project.key}
            type="button"
            onClick={() => onSelect(project)}
            disabled={disabled}
            aria-pressed={project.key === selectedKey}
            title={project.root}
            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minHeight: 40, padding: "8px 10px", background: "var(--bg)", border: "none", borderBottom: "1px solid var(--border)", color: project.key === selectedKey ? "var(--text)" : "var(--text-muted)", cursor: disabled ? "wait" : "pointer", textAlign: "left", fontSize: 12, fontFamily: "var(--font-mono)", opacity: disabled ? 0.6 : 1 }}
          >
            {project.key === selectedKey ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                <polyline points="1.5 5 4 7.5 8.5 2.5" />
              </svg>
            ) : <span style={{ width: 10, flexShrink: 0 }} />}
            <PathLabel text={displayCwd(project.root, homeDir)} style={{ flex: 1 }} />
            {renderActivity?.(project)}
          </button>
        ))}
        {visibleProjects.length === 0 && (
          <div role="status" style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-dim)" }}>
            {t(query.trim() ? "sidebar.noMatchingProjects" : "chat.noWorkspaces")}
          </div>
        )}
      </div>
    </div>
  );
}
