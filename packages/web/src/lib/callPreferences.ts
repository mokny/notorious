const STORAGE_KEY = "notorious:call-prefs";

export interface CallPreferences {
  micDeviceId?: string;
  cameraDeviceId?: string;
  speakerDeviceId?: string;
  /** 0.0-2.0, 1.0 = 100% (unity gain). */
  micGain: number;
  /** 0.0-2.0, 1.0 = 100% (native volume). */
  outputVolume: number;
}

const DEFAULT_PREFS: CallPreferences = { micGain: 1, outputVolume: 1 };

export function getCallPreferences(): CallPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<CallPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      micGain: typeof parsed.micGain === "number" ? parsed.micGain : DEFAULT_PREFS.micGain,
      outputVolume: typeof parsed.outputVolume === "number" ? parsed.outputVolume : DEFAULT_PREFS.outputVolume,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setCallPreferences(patch: Partial<CallPreferences>): CallPreferences {
  const next = { ...getCallPreferences(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) - preference just won't persist.
  }
  return next;
}
