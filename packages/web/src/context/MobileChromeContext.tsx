import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileChromeContextValue {
  /** True while an object with a full-bleed cover is the active page - WorkspaceLayout's mobile header switches from its normal solid bar to a transparent overlay so the cover shows through underneath it (see CoverImage.tsx, which sets this and also drives the Dynamic Island color itself). */
  coverActive: boolean;
  setCoverActive: (active: boolean) => void;
  /** Whether ObjectDetailPage.tsx's Viewing-now/Properties/Sub-objects/Backlinks/Script panels are shown - lifted up here (rather than local state in ObjectDetailPage) so MobileTopBar.tsx's "…" menu can toggle it too, on phone, where the eye-icon button that used to live in the sticky toolbar no longer renders (see that toolbar's own comment). */
  sectionsVisible: boolean;
  setSectionsVisible: (visible: boolean) => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [coverActive, setCoverActive] = useState(false);
  const [sectionsVisible, setSectionsVisible] = useState(false);
  return (
    <MobileChromeContext.Provider value={{ coverActive, setCoverActive, sectionsVisible, setSectionsVisible }}>
      {children}
    </MobileChromeContext.Provider>
  );
}

export function useMobileChrome(): MobileChromeContextValue {
  const context = useContext(MobileChromeContext);
  if (!context) throw new Error("useMobileChrome must be used within a MobileChromeProvider");
  return context;
}
