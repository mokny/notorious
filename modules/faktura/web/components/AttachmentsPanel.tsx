import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type AttachmentEntityType } from "../api.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Freie Dateiablage für Kunden/Aufträge (Verträge, Scans, ...) - keine Versionierung, nutzt die generischen Storage-Primitiven über den SDK (siehe services/attachments.ts). */
export function AttachmentsPanel(props: { workspaceId: string; entityType: AttachmentEntityType; entityId: string }) {
  const { workspaceId, entityType, entityId } = props;
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-attachments", workspaceId, entityType, entityId];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments } = useQuery({
    queryKey,
    queryFn: () => fakturaApi.attachments.list(workspaceId, entityType, entityId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => fakturaApi.attachments.upload(workspaceId, entityType, entityId, file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.attachments.remove(workspaceId, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Dateien</h2>
        <button type="button" className="text-xs text-accent" onClick={() => fileInputRef.current?.click()}>
          + Datei hochladen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = "";
          }}
        />
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {attachments?.map((attachment) => (
          <li key={attachment.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <a href={fakturaApi.attachments.downloadUrl(workspaceId, attachment.id)} className="truncate underline" target="_blank" rel="noreferrer">
              {attachment.filename}
            </a>
            <span className="flex items-center gap-2 text-xs text-ink-muted">
              <span>{formatSize(attachment.sizeBytes)}</span>
              <button type="button" className="hover:text-red-500" onClick={() => removeMutation.mutate(attachment.id)}>
                Entfernen
              </button>
            </span>
          </li>
        ))}
        {attachments?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine Dateien angehängt.</li>}
      </ul>
    </section>
  );
}
