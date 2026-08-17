import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionApi } from "../lib/api/resources.js";
import { IOSMenuItem } from "./nav/IOSMenu.js";
import { Icon } from "./ui/Icon.js";

/**
 * Toggles the current user's subscription to an object (see
 * modules/subscriptions/ on the server) - explicit opt-in only, no
 * auto-subscribe on create/comment. Members-only (same `!share` gate as
 * ShareDialog/ObjectSlugButton next to it in ObjectDetailPage.tsx/
 * MobileTopBar.tsx) - an anonymous share visitor has no account for a
 * subscription to belong to.
 */
export function SubscribeButton({
  objectId,
  variant = "toolbar",
}: {
  objectId: string;
  /** See ShareDialog.tsx's own `variant` doc comment - same two variants, desktop toolbar icon vs. phone/hamburger "…" menu row. */
  variant?: "toolbar" | "menuItem";
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["objectSubscription", objectId],
    queryFn: () => subscriptionApi.status(objectId),
  });
  const subscribed = data?.subscribed ?? false;

  const mutation = useMutation({
    mutationFn: () => (subscribed ? subscriptionApi.unsubscribe(objectId) : subscriptionApi.subscribe(objectId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["objectSubscription", objectId] }),
  });

  const label = subscribed ? t("nav.mobile.unsubscribeFromObject") : t("nav.mobile.subscribeToObject");

  if (variant === "menuItem") {
    return (
      <IOSMenuItem
        icon={subscribed ? "bell-off" : "bell"}
        label={label}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title={label}
      className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised disabled:opacity-50 ${subscribed ? "text-accent" : "text-ink-muted"}`}
    >
      <Icon name={subscribed ? "bell-off" : "bell"} className="h-4 w-4" />
    </button>
  );
}
