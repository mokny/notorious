import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.js";
import { isSharedSession } from "./lib/api/shareMode.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { WorkspacePickerPage } from "./pages/WorkspacePickerPage.js";
import { WorkspaceLayout } from "./pages/WorkspaceLayout.js";
import { WorkspaceHome } from "./pages/WorkspaceHome.js";
import { ObjectTypePage } from "./pages/ObjectTypePage.js";
import { ObjectDetailPage } from "./pages/ObjectDetailPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { SharePage, SharedIndexRoute, SharedObjectRoute } from "./pages/SharePage.js";

/**
 * `allowShareSession` lets an anonymous whole-workspace share visitor
 * through instead of bouncing to /login - only used for the `/w/:workspaceId`
 * tree (see SharePage.tsx's redirect there), never for e.g. the workspace
 * picker, which has no meaning without a real account.
 */
function RequireAuth({ children, allowShareSession = false }: { children: React.ReactNode; allowShareSession?: boolean }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user && !(allowShareSession && isSharedSession())) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/share/:token" element={<SharePage />}>
        <Route index element={<SharedIndexRoute />} />
        <Route path="objects/:objectId" element={<SharedObjectRoute />} />
      </Route>
      <Route
        path="/"
        element={
          <RequireAuth>
            <WorkspacePickerPage />
          </RequireAuth>
        }
      />
      <Route
        path="/w/:workspaceId"
        element={
          <RequireAuth allowShareSession>
            <WorkspaceLayout />
          </RequireAuth>
        }
      >
        <Route index element={<WorkspaceHome />} />
        <Route path="types/:objectTypeKey" element={<ObjectTypePage />} />
        <Route path="objects/:objectId" element={<ObjectDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
