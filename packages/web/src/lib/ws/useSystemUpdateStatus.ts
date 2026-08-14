import { useEffect, useRef, useState } from "react";
import type { SystemUpdateStatusMessage } from "@notorious/shared";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

// Safety net for a server process that dies mid-update and never comes back
// (crash, no systemd unit to restart it, etc.) - without this, a client
// that saw "inProgress" but never sees a matching "idle"/"failed" would show
// that banner forever. See SystemUpdateStatusMessage's doc comment.
const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

// How long the "update finished" banner stays up before window.location.reload()
// - just long enough that the reload doesn't feel instantaneous/jarring.
const RELOAD_COUNTDOWN_S = 5;

export type SystemUpdatePhase = "idle" | "inProgress" | "finishing" | "failed" | "stuck";

export interface SystemUpdateBannerState {
  phase: SystemUpdatePhase;
  reason?: "update" | "restart";
  countdown: number;
  dismiss: () => void;
}

/**
 * Global `/ws/system` client - mounted once at the app root (see App.tsx),
 * unauthenticated, works on every route including the login page and
 * anonymous share links. Turns the raw `SystemUpdateStatusMessage` stream
 * into the state `SystemUpdateBanner.tsx` renders.
 *
 * Finish detection has to survive the socket dying when the server process
 * actually restarts (see hub.ts's `broadcastSystemStatus` doc comment): a
 * disconnect while `phase === "inProgress"` just triggers the normal
 * reconnect-with-backoff below, and the *next* status this client receives
 * is what actually resolves the phase. Any "idle" received while
 * `phase === "inProgress"` counts as finished, regardless of `reason` or
 * `version` - the server's in-memory status (see `lastSystemStatus` in
 * hub.ts) only ever defaults back to "idle" on a fresh process boot, it's
 * never explicitly re-broadcast by a still-running process, so there is no
 * scenario where a reconnecting client sees "idle" *without* the process
 * having actually restarted. (An earlier version of this hook additionally
 * required the reported `version` to differ for `reason: "update"`, which
 * broke whenever an update was triggered with no new commits to pull - the
 * script still rebuilds/restarts, but the version string never changes, so
 * the banner got stuck until the stuck-timeout below.)
 */
export function useSystemUpdateStatus(): SystemUpdateBannerState {
  const [phase, setPhase] = useState<SystemUpdatePhase>("idle");
  const [reason, setReason] = useState<"update" | "restart" | undefined>();
  const [countdown, setCountdown] = useState(RELOAD_COUNTDOWN_S);
  const dismissedRef = useRef(false);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reloadIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = RECONNECT_BASE_DELAY_MS;
    // Tracked outside React state so onmessage can read the phase/reason
    // this same effect last set without depending on (and re-running for)
    // either - a plain closure over the `phase`/`reason` state variables
    // would only ever see their value from the initial render, since this
    // effect intentionally runs once (see the eslint-disable below).
    let currentPhase: SystemUpdatePhase = "idle";

    function clearStuckTimeout(): void {
      clearTimeout(stuckTimeoutRef.current);
    }

    function armStuckTimeout(): void {
      clearStuckTimeout();
      stuckTimeoutRef.current = setTimeout(() => {
        currentPhase = "stuck";
        setPhase("stuck");
      }, STUCK_TIMEOUT_MS);
    }

    function startFinishing(): void {
      clearStuckTimeout();
      dismissedRef.current = false;
      currentPhase = "finishing";
      setPhase("finishing");
      setCountdown(RELOAD_COUNTDOWN_S);
      let remaining = RELOAD_COUNTDOWN_S;
      clearInterval(reloadIntervalRef.current);
      reloadIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(reloadIntervalRef.current);
          window.location.reload();
        }
      }, 1000);
    }

    function handleStatus(message: SystemUpdateStatusMessage): void {
      if (dismissedRef.current && message.status === "inProgress") dismissedRef.current = false;

      if (message.status === "inProgress") {
        if (currentPhase !== "inProgress") armStuckTimeout();
        currentPhase = "inProgress";
        setReason(message.reason);
        setPhase("inProgress");
        return;
      }

      if (message.status === "failed") {
        clearStuckTimeout();
        currentPhase = "failed";
        setReason(message.reason);
        setPhase("failed");
        return;
      }

      // status === "idle" - only a meaningful "finished" signal if we were
      // actually waiting on one; the very first message a freshly opened tab
      // ever receives is also "idle" and must not be treated as a finish.
      // See this hook's doc comment for why no further check (e.g. on
      // `version`) is needed here.
      if (currentPhase !== "inProgress") return;
      startFinishing();
    }

    function connect(): void {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/system`);

      socket.onopen = () => {
        reconnectDelay = RECONNECT_BASE_DELAY_MS;
      };

      socket.onmessage = (event) => {
        handleStatus(JSON.parse(event.data) as SystemUpdateStatusMessage);
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeout = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      clearStuckTimeout();
      clearInterval(reloadIntervalRef.current);
      socket?.close();
    };
    // Deliberately runs once - nothing in scope needs to re-run this on
    // re-render (see `currentPhase`/`currentReason` above for why the state
    // setters' own values are never read back through a stale closure).
  }, []);

  return {
    phase,
    reason,
    countdown,
    dismiss: () => {
      dismissedRef.current = true;
      setPhase((p) => (p === "failed" || p === "stuck" ? "idle" : p));
    },
  };
}
