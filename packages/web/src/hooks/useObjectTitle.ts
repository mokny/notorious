import { useQuery } from "@tanstack/react-query";
import { objectApi } from "../lib/api/resources.js";

/** Resolves a related object's display title (and icon) by id, cached indefinitely. */
export function useObjectTitle(objectId: string | undefined): { title: string; icon: string | null } {
  const { data } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId!),
    enabled: Boolean(objectId),
    staleTime: 30_000,
  });

  return { title: data?.title ?? "Untitled", icon: data?.icon ?? null };
}
