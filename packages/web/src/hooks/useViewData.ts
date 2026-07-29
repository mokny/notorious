import { useQuery } from "@tanstack/react-query";
import type { ObjectRecord, Property, View } from "@notorious/shared";
import { schemaApi, viewApi } from "../lib/api/resources.js";

interface ViewData {
  items: ObjectRecord[];
  properties: Property[];
  isLoading: boolean;
}

/** Shared data-fetching for every view type: same query, same properties, different rendering. */
export function useViewData(view: View | undefined): ViewData {
  const resultsQuery = useQuery({
    queryKey: ["viewResults", view?.id],
    queryFn: () => viewApi.results(view!.id, { limit: 200 }),
    enabled: Boolean(view),
  });

  const propertiesQuery = useQuery({
    queryKey: ["properties", view?.objectTypeId],
    queryFn: () => schemaApi.properties(view!.objectTypeId!),
    enabled: Boolean(view?.objectTypeId),
  });

  return {
    items: resultsQuery.data?.items ?? [],
    properties: propertiesQuery.data ?? [],
    isLoading: resultsQuery.isLoading || propertiesQuery.isLoading,
  };
}
