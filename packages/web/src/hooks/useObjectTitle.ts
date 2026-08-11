import { useQuery } from "@tanstack/react-query";
import { objectApi, schemaApi } from "../lib/api/resources.js";

/**
 * Resolves a related object's display title and icon by id. The icon falls
 * back to the object's *type* icon (Task -> checkmark, Person -> user, ...)
 * when the object has no custom icon of its own, rather than one generic
 * icon for every object regardless of type.
 */
export function useObjectTitle(workspaceId: string | undefined, objectId: string | undefined): { title: string; icon: string } {
  const { data: object } = useQuery({
    // Distinct from the ["object", objectId] key `ObjectDetailPage` etc. use
    // for the full `GET /api/v1/objects/:id` - this hits the redacted
    // `/summary` endpoint instead, so sharing a cache key would let a
    // reverify-gated full fetch and this stripped-down one clobber each other.
    queryKey: ["objectSummary", objectId],
    queryFn: () => objectApi.summary(objectId!),
    enabled: Boolean(objectId),
    staleTime: 30_000,
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const objectType = objectTypes?.find((type) => type.id === object?.objectTypeId);
  const icon = object?.icon ?? objectType?.icon ?? "file-text";

  return { title: object?.title ?? "Untitled", icon };
}
