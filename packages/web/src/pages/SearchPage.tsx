import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchApi } from "../lib/api/resources.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { isSharedSession } from "../lib/api/shareMode.js";
import { Icon } from "../components/ui/Icon.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";

export function SearchPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [fuzzy, setFuzzy] = useState(true);
  const debouncedQuery = useDebouncedValue(query);

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
    <div className="mx-auto max-w-2xl px-6 py-10">
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
            onClick={() => navigate(`/w/${workspaceId}/objects/${object.id}`)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-4 w-4 text-ink-muted" />
            {object.title || "Untitled"}
          </button>
        ))}
        {debouncedQuery && results?.length === 0 && <p className="p-3 text-sm text-ink-muted">No results for "{debouncedQuery}"</p>}
      </div>
    </div>
  );
}
