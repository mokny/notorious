import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon.js";

/** Shown in place of a content image (block, cover, gallery thumbnail, file preview) once useRobustImage.ts gives up retrying - lets the user retry manually instead of silently leaving a broken image. */
export function ImageLoadError({
  onRetry,
  className,
  style,
}: {
  onRetry: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRetry();
      }}
      title={t("ui.imageLoadError.retryTitle")}
      style={style}
      className={`flex flex-col items-center justify-center gap-1.5 bg-surface-raised text-xs text-ink-muted hover:text-ink ${className ?? "h-28 w-full"}`}
    >
      <Icon name="image" className="h-5 w-5" />
      {t("ui.imageLoadError.message")}
    </button>
  );
}
