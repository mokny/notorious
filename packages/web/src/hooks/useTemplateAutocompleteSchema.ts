import { useQuery } from "@tanstack/react-query";
import { templateApi } from "../lib/api/resources.js";

/** Object types + their properties, for TemplateSuggestion.ts's `.`-triggered property autocomplete - see modules/templates/routes.ts. Schema changes rarely enough that a short revalidation window is fine; a stale suggestion list is a minor inconvenience, not a correctness issue (the real template parser/renderer is still the source of truth for what actually works). */
export function useTemplateAutocompleteSchema(workspaceId: string) {
  return useQuery({
    queryKey: ["templateAutocompleteSchema", workspaceId],
    queryFn: () => templateApi.autocompleteSchema(workspaceId),
    staleTime: 5 * 60 * 1000,
  });
}
