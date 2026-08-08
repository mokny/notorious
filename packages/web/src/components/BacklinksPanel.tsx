import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { objectApi } from "../lib/api/resources.js";
import { CollapsibleSection } from "./ui/CollapsibleSection.js";
import { HighlightedText } from "./editor/HighlightedText.js";
import { Icon } from "./ui/Icon.js";

export function BacklinksPanel({
  objectId,
  workspaceId,
  forceExpanded,
  highlightTerms = [],
}: {
  objectId: string;
  workspaceId: string;
  /** Forwarded to the underlying CollapsibleSection - see its own doc comment. */
  forceExpanded?: boolean;
  /** Search words to highlight in each backlink's title - see ObjectDetailPage.tsx's `titleTerms`. */
  highlightTerms?: string[];
}) {
  const { data: backlinks } = useQuery({ queryKey: ["backlinks", objectId], queryFn: () => objectApi.backlinks(objectId) });

  if (!backlinks || backlinks.length === 0) return null;

  return (
    <CollapsibleSection title={`Linked from ${backlinks.length} object(s)`} forceExpanded={forceExpanded}>
      <div className="space-y-1">
        {backlinks.map((object) => (
          <Link
            key={object.id}
            to={`/w/${workspaceId}/objects/${object.id}`}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-3.5 w-3.5 text-ink-muted" />
            <HighlightedText text={object.title} terms={highlightTerms} />
          </Link>
        ))}
      </div>
    </CollapsibleSection>
  );
}
