import { useState, type Ref } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchApi } from "../../lib/api/resources.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { splitSearchTerms } from "../../lib/searchHighlight.js";
import { HighlightedText } from "../editor/HighlightedText.js";
import { Icon } from "../ui/Icon.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";

interface SearchPanelProps {
  workspaceId: string;
  /** Called with the picked result's id and the in-progress query (for highlight-on-open) - the caller decides how to navigate (full page vs. tablet split-view vs. closing the mobile sheet first). */
  onSelect: (objectId: string, query: string) => void;
  autoFocus?: boolean;
  /** Exposes the search input so SearchSheet.tsx can focus it explicitly once its open animation finishes, instead of relying on `autoFocus` (which would fight the slide-up transition and pop the keyboard mid-animation). */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * The search box + saved-searches + results list - extracted from
 * SearchPage.tsx so the same UI can be reused both by the desktop/tablet
 * `/search` route and the mobile slide-up SearchSheet.tsx, which has no
 * route of its own (see SearchOverlayContext.tsx).
 */
export function SearchPanel({ workspaceId, onSelect, autoFocus = true, inputRef }: SearchPanelProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [fuzzy, setFuzzy] = useState(true);
  const debouncedQuery = useDebouncedValue(query);
  const searchTerms = splitSearchTerms(debouncedQuery);

  const { data: results } = useQuery({
    queryKey: ["search", workspaceId, debouncedQuery, fuzzy],
    queryFn: () => searchApi.search(workspaceId, { q: debouncedQuery, fuzzy }),
    enabled: Boolean(workspaceId),
  });

  const { data: savedSearches } = useQuery({
    queryKey: ["savedSearches", workspaceId],
    queryFn: () => searchApi.savedSearches(workspaceId),
    // Saved searches are per-user and their endpoint isn't share-aware -
    // meaningless (and a guaranteed 401) for an anonymous share session.
    enabled: Boolean(workspaceId) && !isSharedSession(),
  });

  const saveMutation = useMutation({
    mutationFn: () => searchApi.createSavedSearch(workspaceId, { name: query, query, filters: [] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savedSearches", workspaceId] }),
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <TextField
          ref={inputRef}
          autoFocus={autoFocus}
          placeholder="Search everything in this workspace…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // iOS Safari/PWA auto-zooms the whole page in on focus whenever a
          // focused input's *computed* font-size is under 16px (its way of
          // keeping the text legible) - TextField's own text-sm is 14px.
          // That zoom is almost certainly the real cause behind "the sheet
          // slides off the top when the keyboard opens" (SearchSheet.tsx's
          // visualViewport-based keyboard-inset fix addresses a real but
          // separate issue - the sheet's own height not shrinking - and
          // wasn't enough on its own). An inline style, not a `text-base`
          // class, so it reliably wins regardless of Tailwind's generated
          // CSS order for two same-specificity utility classes.
          style={{ fontSize: 16 }}
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
            onClick={() => onSelect(object.id, debouncedQuery)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-4 w-4 text-ink-muted" />
            <HighlightedText text={object.title || "Untitled"} terms={searchTerms} />
          </button>
        ))}
        {debouncedQuery && results?.length === 0 && <p className="p-3 text-sm text-ink-muted">No results for "{debouncedQuery}"</p>}
      </div>
    </div>
  );
}
