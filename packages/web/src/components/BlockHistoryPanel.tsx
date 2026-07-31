import { useQuery } from "@tanstack/react-query";
import { blockApi } from "../lib/api/resources.js";
import { Icon } from "./ui/Icon.js";

/** Shown below Properties for whichever block was last clicked (see ObjectDetailPage.tsx/BlockItem.tsx) - the last up-to-10 edits to that one block, newest first. */
export function BlockHistoryPanel({ blockId }: { blockId: string }) {
  const { data: entries } = useQuery({
    queryKey: ["blockHistory", blockId],
    queryFn: () => blockApi.history(blockId),
  });

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
        <Icon name="history" className="h-3.5 w-3.5" /> History
      </h3>
      {!entries || entries.length === 0 ? (
        <p className="text-xs text-ink-muted">No edits recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="text-xs">
              <p className="text-ink">{entry.summary}</p>
              <p className="text-ink-muted">
                {entry.actorName} · {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
