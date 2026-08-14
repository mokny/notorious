import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { ConfirmProvider } from "./context/ConfirmContext.js";
import { App } from "./App.js";
import "./lib/i18n.js";
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

  // push-sw.ts's notificationclick handler stashes its target URL here
  // (via postMessage, below) before calling `client.navigate()`, so that an
  // update-triggered reload racing that navigation - see the comment on
  // `controllerchange` below - lands on the notification's target instead of
  // whatever URL happened to be current when the reload fired. Cleared a few
  // seconds after being set if no such reload shows up, since by then
  // `navigate()` already landed on its own and the stashed value is stale.
  const PENDING_PUSH_NAV_KEY = "push-pending-nav";
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; url?: string } | undefined;
    if (data?.type !== "pending-push-nav" || typeof data.url !== "string") return;
    const url = data.url;
    sessionStorage.setItem(PENDING_PUSH_NAV_KEY, url);
    setTimeout(() => {
      if (sessionStorage.getItem(PENDING_PUSH_NAV_KEY) === url) sessionStorage.removeItem(PENDING_PUSH_NAV_KEY);
    }, 5000);
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
    const pendingUrl = sessionStorage.getItem(PENDING_PUSH_NAV_KEY);
    if (pendingUrl) {
      sessionStorage.removeItem(PENDING_PUSH_NAV_KEY);
      window.location.href = pendingUrl;
    } else {
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
