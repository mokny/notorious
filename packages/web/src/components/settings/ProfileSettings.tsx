import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Cropper, { type Area } from "react-easy-crop";
import { SUPPORTED_LOCALES } from "@notorious/shared";
import { authApi, usersApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { ApiError } from "../../lib/api/client.js";
import { useRobustImage } from "../../hooks/useRobustImage.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";

/** Human-readable label per supported locale code - extend alongside `packages/shared/src/locales/`. */
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
};

const AVATAR_EXPORT_SIZE = 256;

/** Loads a `File`/object URL into an `HTMLImageElement`, for `getCroppedAvatarBlob` to draw from. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = src;
  });
}

/** Standard react-easy-crop canvas pattern: draws just the cropped area, scaled to a fixed `AVATAR_EXPORT_SIZE` square, and exports it as a PNG blob. */
async function getCroppedAvatarBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, AVATAR_EXPORT_SIZE, AVATAR_EXPORT_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export cropped image"))), "image/png");
  });
}

/** Lets the current user change their own avatar or email address. */
export function ProfileSettings() {
  const { t, i18n } = useTranslation();
  const { user, refetch } = useAuth();
  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [contentFontSizeError, setContentFontSizeError] = useState<string | null>(null);
  const [contentFontSizeMobile, setContentFontSizeMobile] = useState(user?.contentFontSizeMobile ?? 100);
  const [contentFontSizeDesktop, setContentFontSizeDesktop] = useState(user?.contentFontSizeDesktop ?? 100);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarImageSrc, setAvatarImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function closeCropModal() {
    if (avatarImageSrc) URL.revokeObjectURL(avatarImageSrc);
    setAvatarImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  function handleAvatarFileChange(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarImageSrc(URL.createObjectURL(file));
  }

  const uploadAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!avatarImageSrc || !croppedArea) throw new Error("Nothing to crop");
      const blob = await getCroppedAvatarBlob(avatarImageSrc, croppedArea);
      return usersApi.uploadAvatar(blob);
    },
    onSuccess: async () => {
      closeCropModal();
      await refetch();
    },
    onError: (err) => {
      setAvatarError(err instanceof ApiError ? err.message : t("settings.profile.avatarUploadFailed"));
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => usersApi.deleteAvatar(),
    onSuccess: async () => {
      await refetch();
    },
    onError: (err) => {
      setAvatarError(err instanceof ApiError ? err.message : t("settings.profile.avatarRemoveFailed"));
    },
  });

  const avatarImage = useRobustImage(user?.avatarUrl ?? null);

  const emailMutation = useMutation({
    mutationFn: () => authApi.changeEmail({ newEmail, currentPassword: emailPassword }),
    onSuccess: async () => {
      setEmailPassword("");
      setEmailError(null);
      setEmailSuccess(true);
      await refetch();
    },
    onError: (err) => {
      setEmailSuccess(false);
      setEmailError(err instanceof ApiError ? err.message : t("settings.profile.emailUpdateFailed"));
    },
  });

  const contentFontSizeMutation = useMutation({
    mutationFn: (input: { contentFontSizeMobile: number; contentFontSizeDesktop: number }) => authApi.updateContentFontSize(input),
    onSuccess: async () => {
      setContentFontSizeError(null);
      await refetch();
    },
    onError: (err) => {
      setContentFontSizeError(err instanceof ApiError ? err.message : t("settings.profile.contentFontSizeUpdateFailed"));
    },
  });

  function commitContentFontSize(mobile: number, desktop: number) {
    contentFontSizeMutation.mutate({ contentFontSizeMobile: mobile, contentFontSizeDesktop: desktop });
  }

  // Keeps the sliders in sync when the value changes elsewhere (e.g. another
  // tab/device via the `userSettingsUpdated` WS event) - safe to run
  // unconditionally since a drag in progress here only commits (and thus
  // only triggers a `user` change) on release, never mid-drag.
  useEffect(() => {
    if (user?.contentFontSizeMobile !== undefined) setContentFontSizeMobile(user.contentFontSizeMobile);
    if (user?.contentFontSizeDesktop !== undefined) setContentFontSizeDesktop(user.contentFontSizeDesktop);
  }, [user?.contentFontSizeMobile, user?.contentFontSizeDesktop]);

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailSuccess(false);
    emailMutation.mutate();
  }

  const localeMutation = useMutation({
    mutationFn: (locale: string) => authApi.updateLocale({ locale }),
    onSuccess: async (_, locale) => {
      setLocaleError(null);
      await i18n.changeLanguage(locale);
      await refetch();
    },
    onError: (err) => {
      setLocaleError(err instanceof ApiError ? err.message : t("settings.profile.languageUpdateFailed"));
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{t("settings.profile.avatar")}</p>
        <div className="flex items-center gap-3">
          {user?.avatarUrl && !avatarImage.failed ? (
            <img src={avatarImage.src} onError={avatarImage.onError} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ backgroundColor: user?.avatarColor }}
            >
              {user?.name?.[0]}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => avatarInputRef.current?.click()}>
              <Icon name="upload" className="h-3.5 w-3.5" /> {t("settings.profile.uploadAvatar")}
            </Button>
            {user?.avatarUrl && (
              <Button type="button" variant="danger" onClick={() => removeAvatarMutation.mutate()} disabled={removeAvatarMutation.isPending}>
                <Icon name="trash" className="h-3.5 w-3.5" /> {t("settings.profile.removeAvatar")}
              </Button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
          </div>
        </div>
        {avatarError && <p className="text-sm text-red-500">{avatarError}</p>}
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{t("settings.profile.email")}</p>
        <div className="flex flex-wrap gap-2">
          <TextField type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="max-w-xs" required />
          <TextField
            type="password"
            placeholder={t("settings.profile.currentPassword")}
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            className="max-w-xs"
            required
          />
          <Button type="submit" variant="secondary" disabled={emailMutation.isPending}>
            {t("settings.profile.updateEmail")}
          </Button>
        </div>
        {emailError && <p className="text-sm text-red-500">{emailError}</p>}
        {emailSuccess && <p className="text-sm text-green-600">{t("settings.profile.emailUpdated")}</p>}
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{t("settings.profile.language")}</p>
        <select
          value={user?.locale ?? i18n.language}
          onChange={(e) => localeMutation.mutate(e.target.value)}
          disabled={localeMutation.isPending}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_LABELS[locale] ?? locale}
            </option>
          ))}
        </select>
        {localeError && <p className="text-sm text-red-500">{localeError}</p>}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-ink-muted">{t("settings.profile.appearance")}</p>
        <p className="text-sm font-medium text-ink">{t("settings.profile.contentFontSize")}</p>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>{t("settings.profile.contentFontSizeMobile")}</span>
            <span>{contentFontSizeMobile}%</span>
          </div>
          <input
            type="range"
            min={80}
            max={150}
            step={1}
            value={contentFontSizeMobile}
            onChange={(e) => setContentFontSizeMobile(Number(e.target.value))}
            onMouseUp={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            onTouchEnd={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            onKeyUp={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            className="w-full max-w-xs accent-accent"
          />
          <p className="max-w-xs" style={{ fontSize: `${(contentFontSizeMobile / 100) * 0.875}rem` }}>
            {t("settings.profile.contentFontSizePreview")}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>{t("settings.profile.contentFontSizeDesktop")}</span>
            <span>{contentFontSizeDesktop}%</span>
          </div>
          <input
            type="range"
            min={80}
            max={150}
            step={1}
            value={contentFontSizeDesktop}
            onChange={(e) => setContentFontSizeDesktop(Number(e.target.value))}
            onMouseUp={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            onTouchEnd={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            onKeyUp={() => commitContentFontSize(contentFontSizeMobile, contentFontSizeDesktop)}
            className="w-full max-w-xs accent-accent"
          />
          <p className="max-w-xs" style={{ fontSize: `${(contentFontSizeDesktop / 100) * 0.875}rem` }}>
            {t("settings.profile.contentFontSizePreview")}
          </p>
        </div>

        {contentFontSizeError && <p className="text-sm text-red-500">{contentFontSizeError}</p>}
      </div>

      <Modal
        open={avatarImageSrc !== null}
        onOpenChange={(open) => {
          if (!open) closeCropModal();
        }}
        title={t("settings.profile.cropAvatarTitle")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeCropModal}>
              {t("settings.profile.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => uploadAvatarMutation.mutate()}
              disabled={uploadAvatarMutation.isPending || !croppedArea}
            >
              {t("settings.profile.saveAvatar")}
            </Button>
          </>
        }
      >
        {avatarImageSrc && (
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black/80">
            <Cropper
              image={avatarImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
