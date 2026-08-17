import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../packages/web/src/lib/api/client.js";
import type { ModuleWebManifest } from "../../../packages/web/src/modules/types.js";

interface ExampleItem {
  id: string;
  title: string;
  createdAt: string;
}

const exampleApi = {
  list: (workspaceId: string) => apiRequest<ExampleItem[]>(`/api/v1/workspaces/${workspaceId}/modules/example/items`),
  create: (workspaceId: string, title: string) =>
    apiRequest<ExampleItem>(`/api/v1/workspaces/${workspaceId}/modules/example/items`, { method: "POST", body: { title } }),
  remove: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/modules/example/items/${id}`, { method: "DELETE" }),
};

/** Landing page for the reference "Example" module - proves the module SDK end to end (its own migrated table, gated routes, live sidebar entry) and doubles as a template for a real module's own page. */
function ExampleItemsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const queryKey = ["module-example-items", workspaceId];

  const { data: items } = useQuery({ queryKey, queryFn: () => exampleApi.list(workspaceId!), enabled: Boolean(workspaceId) });

  const createMutation = useMutation({
    mutationFn: () => exampleApi.create(workspaceId!, title),
    onSuccess: () => {
      setTitle("");
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => exampleApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-10">
      <h1 className="text-xl font-semibold">Example module</h1>
      <p className="text-sm text-ink-muted">
        Reference module - proves the module SDK (its own table, gated routes, sidebar entry) end to end.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New item title"
        />
        <button
          type="submit"
          disabled={!title.trim() || createMutation.isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {items?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{item.title}</span>
            <button className="text-xs text-ink-muted hover:text-red-500" onClick={() => removeMutation.mutate(item.id)}>
              Delete
            </button>
          </li>
        ))}
        {items?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No items yet.</li>}
      </ul>
    </div>
  );
}

function ExampleAboutPage() {
  return (
    <div className="mx-auto max-w-xl space-y-2 px-6 py-10">
      <h1 className="text-xl font-semibold">About the Example module</h1>
      <p className="text-sm text-ink-muted">
        This page exists to prove a module can register more than one sidebar sub-item.
      </p>
    </div>
  );
}

const manifest: ModuleWebManifest = {
  id: "example",
  navLabel: "Example",
  navIcon: "package",
  subItems: [
    { label: "Items", path: "items" },
    { label: "About", path: "about" },
  ],
  routes: [
    { path: "items", element: <ExampleItemsPage /> },
    { path: "about", element: <ExampleAboutPage /> },
  ],
};

export { manifest };
