import { useEffect } from "react";

/** Sets the browser tab title while this component is mounted, restoring whatever it was before on unmount - without the restore, navigating from an object page to an unrelated route (this is a single-page app, so there's no fresh document load to reset it) would leave the tab stuck on the last object's title. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
