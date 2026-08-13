import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { fileApi } from "../../lib/api/resources.js";
import { withShareToken } from "../../lib/api/shareMode.js";
import { useRobustImage } from "../../hooks/useRobustImage.js";
import { Icon } from "../ui/Icon.js";
import { ImageLoadError } from "../ui/ImageLoadError.js";

interface FilePropertyFieldProps {
  workspaceId: string;
  objectId: string | null;
  value: string | null;
  isImage: boolean;
  onChange: (fileId: string | null) => void;
}

/** File/Image property: stores a single uploaded file's id as the property value. */
export function FilePropertyField({ workspaceId, objectId, value, isImage, onChange }: FilePropertyFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const image = useRobustImage(isImage && value ? withShareToken(fileApi.downloadUrl(value)) : null);

  async function handleFile(file: File) {
    const asset = await fileApi.upload(workspaceId, file, objectId ?? undefined);
    onChange(asset.id);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        {isImage ? (
          image.failed ? (
            <ImageLoadError onRetry={image.retry} className="h-10 w-10 rounded-md" />
          ) : (
            <img src={image.src} onError={image.onError} alt="" className="h-10 w-10 rounded-md object-cover" />
          )
        ) : (
          <a
            href={withShareToken(fileApi.downloadUrl(value))}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-accent"
          >
            <Icon name="paperclip" className="h-3.5 w-3.5" /> {t("properties.filePropertyField.openFile")}
          </a>
        )}
        <button type="button" onClick={() => onChange(null)} className="text-xs text-ink-muted hover:text-red-500">
          {t("properties.filePropertyField.remove")}
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
        {isImage ? t("properties.filePropertyField.uploadImage") : t("properties.filePropertyField.uploadFile")}
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
