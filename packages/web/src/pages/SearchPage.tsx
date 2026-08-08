import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/ui/Icon.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { SearchPanel } from "../components/search/SearchPanel.js";
import { ObjectDetailPage } from "./ObjectDetailPage.js";

export function SearchPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  const splitActive = breakpoint === "tablet";
  const openObjectId = splitActive ? searchParams.get("open") : null;

  function openObject(objectId: string, query: string) {
    if (splitActive) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("open", objectId);
        next.set("highlight", query);
        return next;
      });
    } else {
      const params = new URLSearchParams({ highlight: query });
      navigate(`/w/${workspaceId}/objects/${objectId}?${params}`);
    }
  }

  return (
    <div className="flex h-full">
      <div className={`h-full overflow-y-auto px-6 py-10 ${splitActive ? "w-full max-w-sm shrink-0 border-r border-border" : "mx-auto max-w-2xl flex-1"}`}>
        <SearchPanel workspaceId={workspaceId!} onSelect={openObject} />
      </div>

      {splitActive &&
        (openObjectId ? (
          <div key={openObjectId} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <button
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("open");
                  return next;
                })
              }
              className="flex items-center gap-1.5 self-start px-4 pt-3 text-xs text-ink-muted hover:text-ink"
            >
              <Icon name="close" className="h-3.5 w-3.5" /> Close
            </button>
            <ObjectDetailPage workspaceId={workspaceId} objectId={openObjectId} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">Select an object to view it here.</div>
        ))}
    </div>
  );
}
