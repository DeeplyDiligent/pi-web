"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { describeProjectChoices } from "@/lib/new-session-context";
import type { SidebarProject } from "@/lib/session-tree";
import { SidebarMenu, type SidebarMenuAnchor, type SidebarMenuItem } from "./SidebarMenu";
import { FolderIcon, FolderPlusIcon } from "./SidebarIcons";

interface Props {
  projects: readonly SidebarProject[];
  value: string | null;
  onChange: (projectKey: string | null) => void;
  mobile: boolean;
  active: boolean;
  onUseDefaultDirectory: () => void;
  onOpenFolder: () => void;
}

interface FolderActions {
  defaultLabel: string;
  openLabel: string;
  onUseDefaultDirectory: () => void;
  onOpenFolder: () => void;
}

/** Same project names, disambiguation and searchable path titles as the Files picker. */
export function sessionProjectFilterItems(
  projects: readonly SidebarProject[], value: string | null, mobile: boolean,
  allLabel: string, onChange: Props["onChange"], folderActions?: FolderActions,
): SidebarMenuItem[] {
  return [
    { type: "item", id: "all-projects", label: allLabel, checked: value === null, onSelect: () => onChange(null) },
    ...describeProjectChoices(projects).map(({ choice, name, note }): SidebarMenuItem => ({
      type: "item",
      id: `project:${choice.key}`,
      label: mobile ? name : choice.root,
      note: mobile ? note ?? undefined : undefined,
      title: choice.root,
      mono: !mobile,
      path: !mobile,
      checked: choice.key === value,
      onSelect: () => onChange(choice.key),
    })),
    ...(folderActions ? [
      { type: "separator", id: "folder-actions" },
      { type: "item", id: "default-directory", label: folderActions.defaultLabel, icon: <FolderIcon size={13} />, onSelect: folderActions.onUseDefaultDirectory },
      { type: "item", id: "open-folder", label: folderActions.openLabel, icon: <FolderPlusIcon size={13} />, onSelect: folderActions.onOpenFolder },
    ] satisfies SidebarMenuItem[] : []),
  ];
}

/** Project choices filter the list; the two folder actions use the existing workspace flows. */
export function SessionProjectFilter({ projects, value, onChange, mobile, active, onUseDefaultDirectory, onOpenFolder }: Props) {
  const { t } = useI18n();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ anchor: SidebarMenuAnchor; width: number } | null>(null);
  const selected = projects.find((project) => project.key === value);
  const allLabel = t("sidebar.allProjects");
  return (
    <div className="session-project-filter">
      <div className="project-picker is-stacked">
        <button
          ref={buttonRef}
          type="button"
          className="project-picker-button is-project"
          title={selected?.root ?? allLabel}
          aria-label={`${t("sidebar.filterProjects")}: ${selected?.name ?? allLabel}`}
          aria-haspopup="menu"
          aria-expanded={active && menu !== null}
          onClick={(event) => {
            if (menu) { setMenu(null); return; }
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({
              anchor: { kind: "rect", rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, align: "start" },
              width: Math.max(220, Math.round(rect.width)),
            });
          }}
        >
          {selected ? (
            <span className="project-picker-path"><span>{selected.root}</span></span>
          ) : <span className="project-picker-label">{allLabel}</span>}
        </button>
      </div>
      <SidebarMenu
        open={active && menu !== null}
        anchor={menu?.anchor ?? null}
        sheet={mobile}
        classic={!mobile}
        width={menu?.width}
        ariaLabel={t("sidebar.filterProjects")}
        title={t("workspace.project")}
        items={sessionProjectFilterItems(projects, value, mobile, allLabel, onChange, {
          defaultLabel: t("sidebar.useDefaultDirectory"),
          openLabel: t("sidebar.openOtherProject"),
          onUseDefaultDirectory,
          onOpenFolder,
        })}
        filter={{ placeholder: t("sidebar.filterProjects"), emptyLabel: t("sidebar.noMatchingProjects"), minChoices: 1 }}
        cancelLabel={t("sidebar.cancel")}
        returnFocusTo={buttonRef.current}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
