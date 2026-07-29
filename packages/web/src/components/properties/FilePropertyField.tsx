import { useRef } from "react";
import { fileApi } from "../../lib/api/resources.js";
import { Icon } from "../ui/Icon.js";

interface FilePropertyFieldProps {
  workspaceId: string;
  objectId: string | null;
  value: string | null;
  isImage: boolean;
  onChange: (fileId: string | null) => void;
}

/** File/Image property: stores a single uploaded file's id as the property value. */
export function FilePropertyField({ workspaceId, objectId, value, isImage, onChange }: FilePropertyFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const asset = await fileApi.upload(workspaceId, file, objectId ?? undefined);
    onChange(asset.id);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        {isImage ? (
          <img src={fileApi.downloadUrl(value)} alt="" className="h-10 w-10 rounded-md object-cover" />
        ) : (
          <a href={fileApi.downloadUrl(value)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-accent">
            <Icon name="paperclip" className="h-3.5 w-3.5" /> Open file
          </a>
        )}
        <button type="button" onClick={() => onChange(null)} className="text-xs text-ink-muted hover:text-red-500">
          Remove
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-ink-muted hover:border-accent hover:text-accent"
      >
        Upload {isImage ? "image" : "file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={isImage ? "image/*" : undefined}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </>
  );
}
