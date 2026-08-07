import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchApi } from "../lib/api/resources.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { isSharedSession } from "../lib/api/shareMode.js";
import { Icon } from "../components/ui/Icon.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { ObjectDetailPage } from "./ObjectDetailPage.js";

export function SearchPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [fuzzy, setFuzzy] = useState(true);
  const debouncedQuery = useDebouncedValue(query);
  const [searchParams, setSearchParams] = useSearchParams();
  const breakpoint = useBreakpoint();
  const splitActive = breakpoint === "tablet";
  const openObjectId = splitActive ? searchParams.get("open") : null;

  function openObject(objectId: string) {
    if (splitActive) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("open", objectId);
        next.set("highlight", debouncedQuery);
        return next;
      });
    } else {
      const params = new URLSearchParams({ highlight: debouncedQuery });
      navigate(`/w/${workspaceId}/objects/${objectId}?${params}`);
    }
  }

  const { data: results } = useQuery({
    queryKey: ["search", workspaceId, debouncedQuery, fuzzy],
    queryFn: () => searchApi.search(workspaceId!, { q: debouncedQuery, fuzzy }),
    enabled: Boolean(workspaceId),
  });

  const { data: savedSearches } = useQuery({
    queryKey: ["savedSearches", workspaceId],
    queryFn: () => searchApi.savedSearches(workspaceId!),
    // Saved searches are per-user and their endpoint isn't share-aware -
    // meaningless (and a guaranteed 401) for an anonymous share session.
    enabled: Boolean(workspaceId) && !isSharedSession(),
  });

  const saveMutation = useMutation({
    mutationFn: () => searchApi.createSavedSearch(workspaceId!, { name: query, query, filters: [] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savedSearches", workspaceId] }),
  });

  return (
    <div className="flex h-full">
      <div className={`h-full overflow-y-auto px-6 py-10 ${splitActive ? "w-full max-w-sm shrink-0 border-r border-border" : "mx-auto max-w-2xl flex-1"}`}>
      <div className="flex items-center gap-2">
        <TextField
          autoFocus
          placeholder="Search everything in this workspace…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant={fuzzy ? "primary" : "secondary"} onClick={() => setFuzzy((v) => !v)} title="Toggle fuzzy/typo-tolerant search">
          Fuzzy
        </Button>
        {query && !isSharedSession() && (
          <Button variant="secondary" onClick={() => saveMutation.mutate()}>
            Save
          </Button>
        )}
      </div>

      {savedSearches && savedSearches.length > 0 && !query && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Saved searches</h3>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((saved) => (
              <button
                key={saved.id}
                onClick={() => setQuery(saved.query)}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-raised"
              >
                {saved.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-1">
        {results?.map((object) => (
          <button
            key={object.id}
            onClick={() => openObject(object.id)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-4 w-4 text-ink-muted" />
            {object.title || "Untitled"}
          </button>
        ))}
        {debouncedQuery && results?.length === 0 && <p className="p-3 text-sm text-ink-muted">No results for "{debouncedQuery}"</p>}
      </div>
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
