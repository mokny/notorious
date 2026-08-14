import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { workspaceApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";
import { AccountMenuButton } from "./AccountMenuButton.js";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog.js";

interface WorkspaceRailProps {
  activeWorkspaceId: string;
}

/**
 * Notion-desktop-style far-left icon rail - desktop breakpoint only (see
 * WorkspaceLayout.tsx). Lists every workspace the user belongs to, switching
 * between them in place (no more navigating through WorkspacePickerPage on
 * this breakpoint), plus a "+" to create one and the account menu at the
 * bottom.
 */
export function WorkspaceRail({ activeWorkspaceId }: WorkspaceRailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <aside
      // z-50, not z-0 - the sidebar `<aside>` next to this one is effectively
      // z-40 (see WorkspaceLayout.tsx), and since that's a sibling stacking
      // context, AccountMenuButton's own z-50 popup menu rendered *inside*
      // this rail would still lose to the entire sidebar sitting above it
      // otherwise - the popup's z-index only ranks within its own ancestor
      // context, not against siblings of that ancestor.
      className="relative z-50 flex w-16 shrink-0 flex-col items-center border-r border-border bg-surface"
      style={{
        paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {workspaces?.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;
          return (
            <button
              key={workspace.id}
              onClick={() => navigate(`/w/${workspace.id}`)}
              title={workspace.name}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                isActive ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-surface-raised hover:text-ink"
              }`}
            >
              <Icon name={workspace.icon} className="h-5 w-5" />
            </button>
          );
        })}
        <button
          onClick={() => setCreateDialogOpen(true)}
          title={t("workspacePicker.create")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </nav>
      <AccountMenuButton workspaceId={activeWorkspaceId} variant="compact" side="top" />
      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(workspaceId) => navigate(`/w/${workspaceId}`)}
      />
    </aside>
  );
}
