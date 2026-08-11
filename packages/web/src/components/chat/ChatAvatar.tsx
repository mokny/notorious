import { useRobustImage } from "../../hooks/useRobustImage.js";

/** Colored-circle-with-initial avatar, same convention as WorkspaceLayout.tsx's user menu - reused here for chat participants. */
export function ChatAvatar({
  name,
  avatarColor,
  avatarUrl,
  size = 8,
}: {
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const dimension = `${size * 0.25}rem`;
  const image = useRobustImage(avatarUrl ?? null);
  if (avatarUrl && !image.failed) {
    return (
      <img
        src={image.src}
        onError={image.onError}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: dimension, height: dimension }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: dimension, height: dimension, backgroundColor: avatarColor, fontSize: `${size * 0.11}rem` }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
