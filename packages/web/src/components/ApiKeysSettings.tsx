import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeyApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";
import { Icon } from "./ui/Icon.js";

/** Lets the current user generate/revoke personal API keys for programmatic access. */
export function ApiKeysSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const { data: keys } = useQuery({ queryKey: ["apiKeys"], queryFn: apiKeyApi.list });

  const createMutation = useMutation({
    mutationFn: () => apiKeyApi.create({ name: name || "Untitled key" }),
    onSuccess: (created) => {
      setFreshToken(created.token);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeyApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] }),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="mt-3 space-y-3">
      {freshToken && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            Copy this key now - it won't be shown again.
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-surface px-2 py-1 text-xs">{freshToken}</code>
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(freshToken)}>
              Copy
            </Button>
            <Button variant="ghost" onClick={() => setFreshToken(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {keys?.map((key) => (
          <div key={key.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">{key.name}</p>
              <p className="text-xs text-ink-muted">
                <code>{key.keyPrefix}…</code> - created {new Date(key.createdAt).toLocaleDateString()}
                {key.lastUsedAt ? ` - last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " - never used"}
              </p>
            </div>
            <button onClick={() => revokeMutation.mutate(key.id)} className="text-xs text-red-500 hover:underline">
              Revoke
            </button>
          </div>
        ))}
        {keys?.length === 0 && <p className="text-sm text-ink-muted">No API keys yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <TextField placeholder="Key name (e.g. CI pipeline)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" disabled={createMutation.isPending}>
          <Icon name="plus" className="h-3.5 w-3.5" /> Create key
        </Button>
      </form>
    </div>
  );
}
