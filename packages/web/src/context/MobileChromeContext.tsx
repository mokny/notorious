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

// Falls back to a harmless no-op outside the provider (e.g. the standalone
// share-link route tree, which doesn't render WorkspaceLayout) so
// ObjectDetailPage can call this unconditionally without checking which tree
// it's mounted under (see ObjectHistoryContext.tsx's identical fallback).
const NOOP_VALUE: MobileChromeContextValue = {
  coverActive: false,
  setCoverActive: () => {},
  sectionsVisible: false,
  setSectionsVisible: () => {},
};

export function useMobileChrome(): MobileChromeContextValue {
  return useContext(MobileChromeContext) ?? NOOP_VALUE;
}
