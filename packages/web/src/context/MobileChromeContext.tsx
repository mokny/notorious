import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileChromeContextValue {
  /** True while an object with a full-bleed cover is the active page - WorkspaceLayout's mobile header switches from its normal solid bar to a transparent overlay so the cover shows through underneath it (see CoverImage.tsx, which sets this and also drives the Dynamic Island color itself). */
  coverActive: boolean;
  setCoverActive: (active: boolean) => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [coverActive, setCoverActive] = useState(false);
  return <MobileChromeContext.Provider value={{ coverActive, setCoverActive }}>{children}</MobileChromeContext.Provider>;
}

export function useMobileChrome(): MobileChromeContextValue {
  const context = useContext(MobileChromeContext);
  if (!context) throw new Error("useMobileChrome must be used within a MobileChromeProvider");
  return context;
}
