import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { WorkspacePickerPage } from "./pages/WorkspacePickerPage.js";
import { WorkspaceLayout } from "./pages/WorkspaceLayout.js";
import { ObjectTypePage } from "./pages/ObjectTypePage.js";
import { ObjectDetailPage } from "./pages/ObjectDetailPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
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
          <RequireAuth>
            <WorkspaceLayout />
          </RequireAuth>
        }
      >
        <Route path="types/:objectTypeKey" element={<ObjectTypePage />} />
        <Route path="objects/:objectId" element={<ObjectDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
