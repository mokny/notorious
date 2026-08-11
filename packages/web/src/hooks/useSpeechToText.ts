import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// Chrome/Safari/Edge only - not implemented in Firefox. Read once at module
// scope: callers use `speechToTextSupported` to omit their mic button
// entirely when this is undefined.
const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

export const speechToTextSupported = Boolean(SpeechRecognitionCtor);

/**
 * Continuous, live-interim dictation into a text field - see Composer.tsx and
 * AiThreadView.tsx for the mic button that drives this. `onTranscript` is
 * called with the accumulated (final + in-progress) transcript on every
 * result, so it should be a stable setter (e.g. `setBody`), not a closure
 * that captures other render-scoped state - it's bound once, when `start()`
 * is called, and isn't re-bound on re-render.
 */
export function useSpeechToText(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    finalTranscriptRef.current = "";
    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) finalTranscriptRef.current += result[0].transcript;
        else interimTranscript += result[0].transcript;
      }
      onTranscript(finalTranscriptRef.current + interimTranscript);
    };
    // Fails silently (permission denied, no mic, etc.) - matches the rest of
    // the app's getUserMedia error handling, see CallContext.tsx/PreJoinLobby.tsx.
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  return { isListening, toggleListening };
}
