import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import Cropper, { type Area } from "react-easy-crop";
import { authApi, twoFactorApi, usersApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../lib/api/client.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";
import { Modal } from "./ui/Modal.js";
import { Icon } from "./ui/Icon.js";
import { TwoFactorSetupFlow } from "./TwoFactorSetupFlow.js";

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

/** Lets the current user change their own email address or password - both require re-entering the current password (see auth/service.ts). */
export function AccountSettings() {
  const { user, refetch } = useAuth();
  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

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
      setAvatarError(err instanceof ApiError ? err.message : "Could not upload avatar");
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => usersApi.deleteAvatar(),
    onSuccess: async () => {
      await refetch();
    },
    onError: (err) => {
      setAvatarError(err instanceof ApiError ? err.message : "Could not remove avatar");
    },
  });

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
      setEmailError(err instanceof ApiError ? err.message : "Could not update your email address");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      setPasswordSuccess(true);
    },
    onError: (err) => {
      setPasswordSuccess(false);
      setPasswordError(err instanceof ApiError ? err.message : "Could not update your password");
    },
  });

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailSuccess(false);
    emailMutation.mutate();
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordSuccess(false);
    passwordMutation.mutate();
  }

  const disableMutation = useMutation({
    mutationFn: () => twoFactorApi.disable({ currentPassword: disablePassword }),
    onSuccess: async () => {
      setDisablePassword("");
      setDisableError(null);
      await refetch();
    },
    onError: (err) => {
      setDisableError(err instanceof ApiError ? err.message : "Could not disable two-factor authentication");
    },
  });

  function handleDisableSubmit(event: FormEvent) {
    event.preventDefault();
    disableMutation.mutate();
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Avatar</p>
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
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
              <Icon name="upload" className="h-3.5 w-3.5" /> Upload avatar
            </Button>
            {user?.avatarUrl && (
              <Button type="button" variant="danger" onClick={() => removeAvatarMutation.mutate()} disabled={removeAvatarMutation.isPending}>
                <Icon name="trash" className="h-3.5 w-3.5" /> Remove avatar
              </Button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
          </div>
        </div>
        {avatarError && <p className="text-sm text-red-500">{avatarError}</p>}
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Email address</p>
        <div className="flex flex-wrap gap-2">
          <TextField type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="max-w-xs" required />
          <TextField
            type="password"
            placeholder="Current password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            className="max-w-xs"
            required
          />
          <Button type="submit" variant="secondary" disabled={emailMutation.isPending}>
            Update email
          </Button>
        </div>
        {emailError && <p className="text-sm text-red-500">{emailError}</p>}
        {emailSuccess && <p className="text-sm text-green-600">Email address updated.</p>}
      </form>

      <form onSubmit={handlePasswordSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Password</p>
        <div className="flex flex-wrap gap-2">
          <TextField
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="max-w-xs"
            required
          />
          <TextField
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="max-w-xs"
            minLength={8}
            required
          />
          <Button type="submit" variant="secondary" disabled={passwordMutation.isPending}>
            Update password
          </Button>
        </div>
        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
        {passwordSuccess && <p className="text-sm text-green-600">Password updated. Your other sessions have been signed out.</p>}
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Two-factor authentication</p>
        {user?.totpEnabled ? (
          <form onSubmit={handleDisableSubmit} className="space-y-2">
            <p className="text-sm text-ink-muted">Two-factor authentication is enabled on your account.</p>
            <div className="flex flex-wrap gap-2">
              <TextField
                type="password"
                placeholder="Current password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="max-w-xs"
                required
              />
              <Button type="submit" variant="danger" disabled={disableMutation.isPending}>
                Disable 2FA
              </Button>
            </div>
            {disableError && <p className="text-sm text-red-500">{disableError}</p>}
          </form>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">Add an extra layer of security by requiring a code from an authenticator app when you sign in.</p>
            <Button variant="secondary" className="mt-2" onClick={() => setSetupOpen(true)}>
              Enable 2FA
            </Button>
          </div>
        )}
      </div>

      <Modal open={setupOpen} onOpenChange={setSetupOpen} title="Set up two-factor authentication">
        <TwoFactorSetupFlow
          onComplete={async () => {
            setSetupOpen(false);
            await refetch();
          }}
        />
      </Modal>

      <Modal
        open={avatarImageSrc !== null}
        onOpenChange={(open) => {
          if (!open) closeCropModal();
        }}
        title="Crop your avatar"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeCropModal}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => uploadAvatarMutation.mutate()}
              disabled={uploadAvatarMutation.isPending || !croppedArea}
            >
              Save avatar
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
