import type { ChatStatus } from "@notorious/shared";
import { useRobustImage } from "../../hooks/useRobustImage.js";

const STATUS_DOT_COLOR: Record<ChatStatus, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

const OFFLINE_DOT_COLOR = "#9ca3af";

/** Small colored dot overlaying the bottom-right corner of an avatar - see `ChatStatus`'s doc comment. Omitted entirely when `chatStatus` isn't known/set. `online: false` overrides the color to gray regardless of `status` - a manually-set status conveys nothing about someone who isn't around to see the message live. */
function StatusDot({ status, online, avatarSize }: { status: ChatStatus; online: boolean; avatarSize: number }) {
  const dotSize = `${Math.max(avatarSize * 0.09, 0.5)}rem`;
  return (
    <span
      className="absolute right-0 bottom-0 rounded-full ring-2 ring-surface"
      style={{ width: dotSize, height: dotSize, backgroundColor: online ? STATUS_DOT_COLOR[status] : OFFLINE_DOT_COLOR }}
    />
  );
}

/** Colored-circle-with-initial avatar, same convention as WorkspaceLayout.tsx's user menu - reused here for chat participants. */
export function ChatAvatar({
  name,
  avatarColor,
  avatarUrl,
  chatStatus,
  online = true,
  size = 8,
}: {
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  /** This participant's chat status (see `ChatStatus`) - omit to render the avatar with no status dot. */
  chatStatus?: ChatStatus;
  /** Whether this participant currently has an open connection (see `modules/realtime/hub.ts`'s `isUserOnline`). Defaults to true so callers that don't track presence (e.g. the current user's own avatar) don't need to pass it. */
  online?: boolean;
  size?: number;
}) {
  const dimension = `${size * 0.25}rem`;
  const image = useRobustImage(avatarUrl ?? null);
  if (avatarUrl && !image.failed) {
    return (
      <span className="relative inline-flex shrink-0" style={{ width: dimension, height: dimension }}>
        <img src={image.src} onError={image.onError} alt="" className="h-full w-full rounded-full object-cover" />
        {chatStatus && <StatusDot status={chatStatus} online={online} avatarSize={size} />}
      </span>
    );
  }
  return (
    <span className="relative inline-flex shrink-0" style={{ width: dimension, height: dimension }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
        style={{ backgroundColor: avatarColor, fontSize: `${size * 0.11}rem` }}
      >
        {name[0]?.toUpperCase()}
      </span>
      {chatStatus && <StatusDot status={chatStatus} online={online} avatarSize={size} />}
    </span>
  );
}
