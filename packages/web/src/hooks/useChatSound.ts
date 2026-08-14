import { useCallback, useRef, useState } from "react";
import { isDesktop } from "../lib/platform.js";

const MUTE_STORAGE_KEY = "chatSoundMuted";

function readMuted(): boolean {
  return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
}

/**
 * Desktop-only "new chat message" ping - a short synthetic tone via the Web
 * Audio API (no audio file, no licensing concerns). Gated on `isDesktop()`
 * (never plays on iOS/Android) and a `localStorage`-backed mute toggle;
 * callers are additionally responsible for skipping it for the user's own
 * messages and while their own chat status is "yellow"/"red" (see
 * useGlobalRealtime.ts's `chatMessage` handling) - this hook only knows
 * about the sound itself.
 */
export function useChatSound(): { playChatSound: () => void; muted: boolean; setMuted: (muted: boolean) => void } {
  const [muted, setMutedState] = useState(readMuted);
  const audioContextRef = useRef<AudioContext | null>(null);

  const setMuted = useCallback((value: boolean) => {
    localStorage.setItem(MUTE_STORAGE_KEY, value ? "1" : "0");
    setMutedState(value);
  }, []);

  const playChatSound = useCallback(() => {
    if (!isDesktop() || readMuted()) return;

    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.26);
  }, []);

  return { playChatSound, muted, setMuted };
}
