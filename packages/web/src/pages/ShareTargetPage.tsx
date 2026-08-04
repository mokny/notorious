import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import type { ShareInboxItem } from "@notorious/shared";
import { workspaceApi, schemaApi, objectApi, shareTargetApi, linkPreviewApi } from "../lib/api/resources.js";
import { getLastWorkspaceId, setLastWorkspaceId } from "../lib/lastWorkspace.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";

type Action = "create" | "append";

function titleSeedFor(item: ShareInboxItem): string {
  if (item.title) return item.title;
  if (item.files.length > 0) return item.files[0]!.filename;
  if (item.text) return item.text.slice(0, 80);
  return "";
}

export function ShareTargetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [inboxItem, setInboxItem] = useState<ShareInboxItem | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [action, setAction] = useState<Action>("create");
  const [objectTypeId, setObjectTypeId] = useState<string>("");
  const [targetObjectId, setTargetObjectId] = useState<string>("");
  const [objectFilter, setObjectFilter] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    const inboxId = searchParams.get("inboxId");
    const url = searchParams.get("url");
    const paramTitle = searchParams.get("title");
    const text = searchParams.get("text");

    async function resolve() {
      try {
        if (inboxId) {
          setInboxItem(await shareTargetApi.inbox(inboxId));
        } else if (url || text) {
          const { id } = await shareTargetApi.intakeJson({
            url: url ?? undefined,
            title: paramTitle ?? undefined,
            text: text ?? undefined,
          });
          setInboxItem(await shareTargetApi.inbox(id));
        } else {
          setResolveError("Nothing was shared.");
        }
      } catch {
        setResolveError("This shared content has expired or was already used.");
      }
    }
    void resolve();
    // Only ever run once per page load - the query string is the input, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inboxItem) setTitle(titleSeedFor(inboxItem));
  }, [inboxItem]);

  // For a shared URL with no title yet, fetch a preview so the title field isn't left empty.
  useEffect(() => {
    if (inboxItem?.kind === "url" && inboxItem.url && !inboxItem.title) {
      linkPreviewApi
        .fetch(inboxItem.url)
        .then((preview) => {
          if (preview.title) setTitle(preview.title);
        })
        .catch(() => {
          // No preview available - the user can still type a title manually.
        });
    }
  }, [inboxItem]);

  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });

  useEffect(() => {
    if (workspaceId || !workspacesQuery.data || workspacesQuery.data.length === 0) return;
    const lastId = getLastWorkspaceId();
    const stillExists = lastId && workspacesQuery.data.some((w) => w.id === lastId);
    setWorkspaceId(stillExists ? lastId! : workspacesQuery.data[0]!.id);
  }, [workspaceId, workspacesQuery.data]);

  function handleWorkspaceChange(id: string) {
    setWorkspaceId(id);
    setLastWorkspaceId(id);
    setObjectTypeId("");
    setTargetObjectId("");
  }

  const objectTypesQuery = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const sortedObjectTypes = useMemo(
    () => (objectTypesQuery.data ? sortObjectTypesForDisplay(objectTypesQuery.data) : []),
    [objectTypesQuery.data],
  );

  useEffect(() => {
    if (!objectTypeId && sortedObjectTypes.length > 0) setObjectTypeId(sortedObjectTypes[0]!.id);
  }, [objectTypeId, sortedObjectTypes]);

  const objectsQuery = useQuery({
    queryKey: ["shareTargetObjects", workspaceId, objectTypeId],
    queryFn: () => objectApi.list(workspaceId, { objectTypeId, limit: 200 }),
    enabled: action === "append" && Boolean(workspaceId) && Boolean(objectTypeId),
  });
  const filteredObjects = useMemo(() => {
    const items = objectsQuery.data?.items ?? [];
    if (!objectFilter.trim()) return items;
    const needle = objectFilter.toLowerCase();
    return items.filter((o) => o.title.toLowerCase().includes(needle));
  }, [objectsQuery.data, objectFilter]);

  const commitMutation = useMutation({
    mutationFn: () =>
      shareTargetApi.commit({
        inboxId: inboxItem!.id,
        workspaceId,
        title,
        action: action === "create" ? { kind: "create", objectTypeId } : { kind: "append", objectId: targetObjectId },
      }),
    onSuccess: (object) => navigate(`/w/${workspaceId}/objects/${object.id}`),
  });

  if (resolveError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-ink-muted">{resolveError}</p>
      </div>
    );
  }

  if (!inboxItem) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const canSubmit =
    Boolean(workspaceId) &&
    title.trim().length > 0 &&
    (action === "create" ? Boolean(objectTypeId) : Boolean(targetObjectId));

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 p-6">
      <h1 className="text-lg font-semibold text-ink">Share to Notorious</h1>

      <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-ink-muted">
        {inboxItem.kind === "files" && <p>{inboxItem.files.length} file(s): {inboxItem.files.map((f) => f.filename).join(", ")}</p>}
        {inboxItem.kind === "url" && <p>{inboxItem.url}</p>}
        {inboxItem.kind === "text" && <p className="line-clamp-3">{inboxItem.text}</p>}
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Workspace
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          value={workspaceId}
          onChange={(e) => handleWorkspaceChange(e.target.value)}
        >
          {workspacesQuery.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button variant={action === "create" ? "primary" : "secondary"} className="flex-1" onClick={() => setAction("create")}>
          Create new object
        </Button>
        <Button variant={action === "append" ? "primary" : "secondary"} className="flex-1" onClick={() => setAction("append")}>
          Add to existing object
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Object type
        <select
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          value={objectTypeId}
          onChange={(e) => {
            setObjectTypeId(e.target.value);
            setTargetObjectId("");
          }}
        >
          {sortedObjectTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {action === "create" ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Title
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled" />
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField
            value={objectFilter}
            onChange={(e) => setObjectFilter(e.target.value)}
            placeholder={`Search ${sortedObjectTypes.find((t) => t.id === objectTypeId)?.name ?? "objects"}...`}
          />
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
            {filteredObjects.map((object) => (
              <button
                key={object.id}
                onClick={() => setTargetObjectId(object.id)}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-surface-raised ${
                  targetObjectId === object.id ? "bg-accent/10 text-accent" : "text-ink"
                }`}
              >
                {object.title || "Untitled"}
              </button>
            ))}
            {filteredObjects.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">No objects found.</p>}
          </div>
        </div>
      )}

      <Button variant="primary" disabled={!canSubmit || commitMutation.isPending} onClick={() => commitMutation.mutate()}>
        {commitMutation.isPending ? "Sharing..." : "Confirm"}
      </Button>
      {commitMutation.isError && <p className="text-sm text-red-500">Something went wrong. Please try again.</p>}
    </div>
  );
}
