import { useLocalStorageState } from "./useLocalStorageState.js";

/** A collapsible section's open/closed state, remembered across visits. */
export function usePersistedOpen(key: string, defaultOpen: boolean) {
  return useLocalStorageState<boolean>(`notorious-section-${key}`, defaultOpen);
}
