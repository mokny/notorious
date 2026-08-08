import { createContext, useContext, type ReactNode } from "react";

export type ExportFormat = "pdf" | "jpeg" | "html" | "markdown";

interface ExportModeValue {
  format: ExportFormat;
}

const ExportModeContext = createContext<ExportModeValue | null>(null);

/**
 * Marks a subtree as being rendered for export instead of normal on-screen
 * viewing. Block components that behave differently while exporting (forcing
 * sub_object blocks into "embed" display regardless of their stored setting,
 * swapping the Maps block's live iframe for a placeholder in the JPEG format
 * only - see MapsBlock.tsx) read this via `useExportMode()` instead of
 * threading a prop through every intermediate block/container.
 */
export function ExportModeProvider({ format, children }: { format: ExportFormat; children: ReactNode }) {
  return <ExportModeContext.Provider value={{ format }}>{children}</ExportModeContext.Provider>;
}

/** Null outside an ExportModeProvider - i.e. normal, non-export rendering. */
export function useExportMode(): ExportModeValue | null {
  return useContext(ExportModeContext);
}
