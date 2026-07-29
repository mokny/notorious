import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { schemaApi, workspaceApi, authApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useTheme } from "../context/ThemeContext.js";
import { useRealtime } from "../lib/ws/useRealtime.js";
import { Icon } from "../components/ui/Icon.js";

export function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  useRealtime(workspaceId);

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  async function handleLogout() {
    await authApi.logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface-raised">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 border-b border-border px-4 py-4 text-left hover:bg-surface"
        >
          <Icon name={workspace?.icon ?? "sparkles"} className="h-5 w-5 text-accent" />
          <span className="truncate font-medium">{workspace?.name ?? "Loading…"}</span>
        </button>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <NavLink
            to={`/w/${workspaceId}/search`}
            className={({ isActive }) => navClass(isActive)}
          >
            <Icon name="search" /> Search
          </NavLink>

          <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-ink-muted">Objects</p>
          {objectTypes
            ?.slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((type) => (
              <NavLink key={type.id} to={`/w/${workspaceId}/types/${type.key}`} className={({ isActive }) => navClass(isActive)}>
                <Icon name={type.icon} /> {type.name}
              </NavLink>
            ))}

          <NavLink to={`/w/${workspaceId}/settings`} className={({ isActive }) => navClass(isActive)}>
            <Icon name="settings" /> Settings
          </NavLink>
        </nav>

        <div className="flex items-center justify-between border-t border-border p-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: user?.avatarColor }}
            >
              {user?.name?.[0]}
            </span>
            <span className="truncate text-sm">{user?.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggle} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="Toggle theme">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <button onClick={handleLogout} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="Log out">
              <Icon name="close" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function navClass(isActive: boolean): string {
  return `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
    isActive ? "bg-accent/10 text-accent font-medium" : "text-ink-muted hover:bg-surface hover:text-ink"
  }`;
}
