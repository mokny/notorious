import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext.js";
import { Tabs, type TabItem } from "../components/ui/Tabs.js";
import { Icon } from "../components/ui/Icon.js";
import { getLastWorkspaceId } from "../lib/lastWorkspace.js";

/**
 * Instance-wide server administration - workspace-independent, same
 * full-screen layout as AccountSettingsPage.tsx. Gated on `user.isServerAdmin`
 * here too (not just the hidden nav entry), since a non-admin could otherwise
 * navigate straight to the URL.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user?.isServerAdmin) return <Navigate to="/" replace />;

  const TABS: TabItem[] = [
    { key: "settings", label: t("admin.tabs.settings"), to: "/admin/settings" },
    { key: "users", label: t("admin.tabs.users"), to: "/admin/users" },
    { key: "update", label: t("admin.tabs.update"), to: "/admin/update" },
    { key: "audit-log", label: t("admin.tabs.auditLog"), to: "/admin/audit-log" },
  ];

  function handleBack() {
    const lastWorkspaceId = getLastWorkspaceId();
    navigate(lastWorkspaceId ? `/w/${lastWorkspaceId}` : "/");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={handleBack} className="mb-6 flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="chevron-left" className="h-4 w-4" /> {t("settings.back")}
      </button>

      <div className="flex items-center gap-2">
        <Icon name="shield" className="h-5 w-5 text-accent" />
        <h1 className="text-xl font-semibold">{t("admin.title")}</h1>
      </div>
      <div className="mt-4">
        <Tabs items={TABS} />
      </div>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
