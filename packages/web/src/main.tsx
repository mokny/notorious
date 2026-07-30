import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { App } from "./App.js";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Refetch whatever's on screen when a tab regains focus/visibility - this
    // is the catch-up path for anything missed while backgrounded (mobile
    // background tabs get their timers/network throttled, and the workspace
    // WebSocket in useRealtime.ts can drop during that window), and it also
    // covers a PWA resumed from suspension without a full reload. React
    // Query's focus manager listens on `visibilitychange`, so this fires on
    // tab-switching too, not just whole-window blur/focus.
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/push-sw.js").catch(() => {
      // Offline/first-load races are harmless - the browser retries registration itself.
    });
  });

  // A deploy can install a new service worker onto a tab that's already
  // loaded and running the previous version. `clientsClaim` in push-sw.ts
  // means that new worker takes over this tab's requests right away, but the
  // JS/HTML already sitting in memory doesn't refresh itself just because
  // the worker underneath it changed - so reload once, automatically, the
  // moment a new worker takes control, instead of leaving the page stuck on
  // a stale bundle until the user happens to refresh manually.
  let reloadedForNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForNewWorker) return;
    reloadedForNewWorker = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
