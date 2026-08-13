import { useTranslation } from "react-i18next";
import { useCall } from "../../context/CallContext.js";
import { ChatAvatar } from "../chat/ChatAvatar.js";
import { Icon } from "../ui/Icon.js";

/**
 * Full-screen ringing UI - mounted alongside CallView.tsx in App.tsx,
 * renders null unless `phase === "ringing-incoming"`. The ringtone itself
 * plays from CallContext.tsx (Web Audio, starts the moment a `callRing`
 * event arrives, regardless of whether this component happens to be
 * mounted/visible yet).
 */
export function IncomingCallBanner() {
  const { t } = useTranslation();
  const { phase, incoming, acceptIncoming, declineIncoming } = useCall();

  if (phase !== "ringing-incoming" || !incoming) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-surface p-8" style={{ paddingTop: "calc(env(safe-area-inset-top) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
      <div />
      <div className="flex flex-col items-center gap-4">
        <ChatAvatar name={incoming.initiatorName} avatarColor="#6366f1" size={24} />
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">{incoming.initiatorName}</p>
          <p className="text-sm text-ink-muted">{t("calls.incomingBanner.incomingCall")}</p>
        </div>
      </div>
      <div className="flex items-center gap-8">
        <button
          onClick={declineIncoming}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:opacity-90"
          title={t("calls.incomingBanner.decline")}
        >
          <Icon name="phone-off" className="h-6 w-6" />
        </button>
        <button
          onClick={() => void acceptIncoming()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:opacity-90"
          title={t("calls.incomingBanner.accept")}
        >
          <Icon name="phone" className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
