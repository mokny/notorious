import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Workspace } from "@notorious/shared";
import { workspaceApi, fileApi } from "../../lib/api/resources.js";
import { useDebouncedSave } from "../../hooks/useDebouncedSave.js";
import { useAuth } from "../../context/AuthContext.js";
import { TextField } from "../ui/TextField.js";
import { IconPicker } from "../IconPicker.js";
import { Icon } from "../ui/Icon.js";
import { FONT_FAMILY_OPTIONS } from "../../lib/coverTextStyle.js";

/** Extracts the file id from a `fileApi.downloadUrl()`-shaped cover value, so a replaced upload can clean up the one it's replacing - same idiom as useCoverActions.ts's fileIdFromUrl. */
function fileIdFromUrl(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

export function WorkspaceGeneralSettings() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const isOwner = workspace?.ownerId === user?.id;

  const setIconMutation = useMutation({
    mutationFn: (icon: string) => workspaceApi.update(workspaceId!, { icon }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => workspaceApi.update(workspaceId!, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
  const [name, setName] = useDebouncedSave(workspace?.name ?? "", (value) =>
    renameMutation.mutateAsync(value).then(() => undefined),
  );

  const updateWeekStartMutation = useMutation({
    mutationFn: (weekStartsOn: "sunday" | "monday") => workspaceApi.update(workspaceId!, { weekStartsOn }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  // Local draft while dragging - only committed to the server on release
  // (onPointerUp/onKeyUp below), so dragging the slider doesn't fire an API
  // call per pixel. Cleared once the mutation's own refetch lands, so the
  // slider never visibly snaps back to the pre-drag value in between.
  const [coverHeightDraft, setCoverHeightDraft] = useState<number | null>(null);
  const updateCoverHeightMutation = useMutation({
    mutationFn: (coverHeight: number) => workspaceApi.update(workspaceId!, { coverHeight }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setCoverHeightDraft(null);
    },
  });
  const coverHeight = coverHeightDraft ?? workspace?.coverHeight ?? 300;

  const updateImageLimitsMutation = useMutation({
    mutationFn: (
      values: Partial<Pick<Workspace, "imageMaxWidth" | "imageMaxHeight" | "coverMaxWidth" | "coverMaxHeight" | "imageQuality">>,
    ) => workspaceApi.update(workspaceId!, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  // Company banner - owner-only fields (see workspaces/routes.ts's PATCH
  // handler), rendered only when isOwner below. Single mutation shared by
  // every field in this section, same as updateImageLimitsMutation above.
  const companyBannerFileInputRef = useRef<HTMLInputElement>(null);
  const updateCompanyBannerMutation = useMutation({
    mutationFn: (
      values: Partial<
        Pick<
          Workspace,
          | "companyName"
          | "companyCover"
          | "companyBannerHeight"
          | "companyBannerTextColor"
          | "companyBannerBackgroundColor"
          | "companyBannerBold"
          | "companyBannerItalic"
          | "companyBannerLetterSpacing"
          | "companyBannerTextAlign"
          | "companyBannerFadeEnabled"
          | "companyBannerGradientEnabled"
          | "companyBannerBackgroundColor2"
          | "companyBannerGradientAngle"
          | "companyBannerGradientStartPosition"
          | "companyBannerTextShadow"
          | "companyBannerFontFamily"
        >
      >,
    ) => workspaceApi.update(workspaceId!, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });
  const [companyName, setCompanyName] = useDebouncedSave(workspace?.companyName ?? "", (value) =>
    updateCompanyBannerMutation.mutateAsync({ companyName: value || null }).then(() => undefined),
  );

  const [companyBannerGradientAngleDraft, setCompanyBannerGradientAngleDraft] = useState<number | null>(null);
  const updateCompanyBannerGradientAngleMutation = useMutation({
    mutationFn: (companyBannerGradientAngle: number) => workspaceApi.update(workspaceId!, { companyBannerGradientAngle }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setCompanyBannerGradientAngleDraft(null);
    },
  });
  const companyBannerGradientAngle = companyBannerGradientAngleDraft ?? workspace?.companyBannerGradientAngle ?? 90;

  const [companyBannerGradientStartDraft, setCompanyBannerGradientStartDraft] = useState<number | null>(null);
  const updateCompanyBannerGradientStartMutation = useMutation({
    mutationFn: (companyBannerGradientStartPosition: number) =>
      workspaceApi.update(workspaceId!, { companyBannerGradientStartPosition }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setCompanyBannerGradientStartDraft(null);
    },
  });
  const companyBannerGradientStartPosition = companyBannerGradientStartDraft ?? workspace?.companyBannerGradientStartPosition ?? 0;

  const [companyBannerHeightDraft, setCompanyBannerHeightDraft] = useState<number | null>(null);
  const updateCompanyBannerHeightMutation = useMutation({
    mutationFn: (companyBannerHeight: number) => workspaceApi.update(workspaceId!, { companyBannerHeight }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      setCompanyBannerHeightDraft(null);
    },
  });
  const companyBannerHeight = companyBannerHeightDraft ?? workspace?.companyBannerHeight ?? 50;

  async function handleCompanyCoverUpload(file: File) {
    const previousCover = workspace?.companyCover ?? null;
    const asset = await fileApi.upload(workspaceId!, file, undefined, undefined, "cover");
    await updateCompanyBannerMutation.mutateAsync({ companyCover: fileApi.downloadUrl(asset.id) });
    const oldFileId = previousCover ? fileIdFromUrl(previousCover) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
  }

  async function handleCompanyCoverRemove() {
    const previousCover = workspace?.companyCover ?? null;
    await updateCompanyBannerMutation.mutateAsync({ companyCover: null });
    const oldFileId = previousCover ? fileIdFromUrl(previousCover) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
  }

  if (!workspace) return null;

  /** Empty input clears the limit (null = no resizing) - see workspaceApi's updateWorkspaceSchema. */
  function parseLimitInput(value: string): number | null {
    if (value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{t("settings.workspace.general.description", { name: workspace.name })}</p>
      <TextField
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-sm"
        aria-label={t("settings.workspace.general.nameLabel")}
      />
      <IconPicker
        icon={workspace.icon}
        fallbackIcon={workspace.icon}
        onChangeIcon={(newIcon) => setIconMutation.mutateAsync(newIcon ?? "sparkles").then(() => undefined)}
        onUploadIcon={async (file) => {
          const asset = await fileApi.upload(workspaceId!, file);
          return fileApi.downloadUrl(asset.id);
        }}
      />
      <label className="flex max-w-sm items-center justify-between gap-2 text-sm">
        <span>{t("settings.workspace.general.weekStart")}</span>
        <select
          value={workspace.weekStartsOn}
          onChange={(e) => updateWeekStartMutation.mutate(e.target.value as "sunday" | "monday")}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="sunday">{t("settings.workspace.general.sunday")}</option>
          <option value="monday">{t("settings.workspace.general.monday")}</option>
        </select>
      </label>
      <div className="max-w-sm space-y-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>{t("settings.workspace.general.coverHeight")}</span>
          <span className="text-ink-muted">{coverHeight}px</span>
        </div>
        <input
          type="range"
          min={50}
          max={300}
          value={coverHeight}
          onChange={(e) => setCoverHeightDraft(Number(e.target.value))}
          onPointerUp={(e) => updateCoverHeightMutation.mutate(Number(e.currentTarget.value))}
          onKeyUp={(e) => updateCoverHeightMutation.mutate(Number(e.currentTarget.value))}
          className="w-full accent-accent"
          aria-label={t("settings.workspace.general.coverHeight")}
        />
        <div
          className="flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 text-ink-muted"
          style={{ height: coverHeight }}
        >
          <Icon name="image" className="h-5 w-5" />
        </div>
      </div>

      <div className="max-w-sm space-y-3 border-t border-border pt-4">
        <p className="text-sm text-ink-muted">{t("settings.workspace.general.imageLimitsDescription")}</p>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("settings.workspace.general.normalImages")}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder={t("settings.workspace.general.width")}
              defaultValue={workspace.imageMaxWidth ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ imageMaxWidth: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label={t("settings.workspace.general.maxImageWidth")}
            />
            <span className="text-ink-muted">×</span>
            <input
              type="number"
              min={1}
              placeholder={t("settings.workspace.general.height")}
              defaultValue={workspace.imageMaxHeight ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ imageMaxHeight: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label={t("settings.workspace.general.maxImageHeight")}
            />
            <span className="text-ink-muted">px</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{t("settings.workspace.general.coverImages")}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder={t("settings.workspace.general.width")}
              defaultValue={workspace.coverMaxWidth ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ coverMaxWidth: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label={t("settings.workspace.general.maxCoverWidth")}
            />
            <span className="text-ink-muted">×</span>
            <input
              type="number"
              min={1}
              placeholder={t("settings.workspace.general.height")}
              defaultValue={workspace.coverMaxHeight ?? ""}
              onBlur={(e) => updateImageLimitsMutation.mutate({ coverMaxHeight: parseLimitInput(e.target.value) })}
              className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              aria-label={t("settings.workspace.general.maxCoverHeight")}
            />
            <span className="text-ink-muted">px</span>
          </div>
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>{t("settings.workspace.general.webpQuality")}</span>
          <input
            type="number"
            min={1}
            max={100}
            defaultValue={workspace.imageQuality}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= 100) updateImageLimitsMutation.mutate({ imageQuality: Math.round(n) });
            }}
            className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            aria-label={t("settings.workspace.general.webpQuality")}
          />
        </label>
      </div>

      {isOwner && (
        <div className="max-w-sm space-y-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">{t("settings.workspace.general.companyBanner")}</p>
            <p className="text-sm text-ink-muted">{t("settings.workspace.general.companyBannerDescription")}</p>
          </div>

          <TextField
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
            placeholder={t("settings.workspace.general.companyNamePlaceholder")}
            aria-label={t("settings.workspace.general.companyName")}
          />

          <div className="flex items-center gap-2">
            {workspace.companyCover ? (
              <img src={workspace.companyCover} alt="" className="h-10 w-20 rounded-md object-cover" />
            ) : (
              <div className="flex h-10 w-20 items-center justify-center rounded-md bg-surface-raised text-ink-muted">
                <Icon name="image" className="h-4 w-4" />
              </div>
            )}
            <button
              onClick={() => companyBannerFileInputRef.current?.click()}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
            >
              {workspace.companyCover
                ? t("settings.workspace.general.companyCoverChange")
                : t("settings.workspace.general.companyCoverUpload")}
            </button>
            {workspace.companyCover && (
              <button
                onClick={() => void handleCompanyCoverRemove()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-red-500/10 hover:text-red-500"
              >
                {t("settings.workspace.general.companyCoverRemove")}
              </button>
            )}
            <input
              ref={companyBannerFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleCompanyCoverUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-ink-muted">{t("settings.workspace.general.companyCoverHint")}</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{t("settings.workspace.general.companyBannerHeight")}</span>
              <span className="text-ink-muted">{companyBannerHeight}px</span>
            </div>
            <input
              type="range"
              min={30}
              max={150}
              value={companyBannerHeight}
              onChange={(e) => setCompanyBannerHeightDraft(Number(e.target.value))}
              onPointerUp={(e) => updateCompanyBannerHeightMutation.mutate(Number(e.currentTarget.value))}
              onKeyUp={(e) => updateCompanyBannerHeightMutation.mutate(Number(e.currentTarget.value))}
              className="w-full accent-accent"
              aria-label={t("settings.workspace.general.companyBannerHeight")}
            />
            <div
              className="flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 text-ink-muted"
              style={{ height: companyBannerHeight }}
            >
              <Icon name="image" className="h-5 w-5" />
            </div>
          </div>

          {/* Only relevant to the text/background-color mode (companyCover
              unset) - see CompanyBanner.tsx. */}
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{t("settings.workspace.general.companyBannerTextColor")}</span>
              <input
                type="color"
                value={workspace.companyBannerTextColor ?? "#000000"}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerTextColor: e.target.value })}
                className="h-7 w-14 rounded border border-border"
                aria-label={t("settings.workspace.general.companyBannerTextColor")}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{t("settings.workspace.general.companyBannerBackgroundColor")}</span>
              <input
                type="color"
                value={workspace.companyBannerBackgroundColor ?? "#f8fafc"}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerBackgroundColor: e.target.value })}
                className="h-7 w-14 rounded border border-border"
                aria-label={t("settings.workspace.general.companyBannerBackgroundColor")}
              />
            </label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={workspace.companyBannerBold}
                  onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerBold: e.target.checked })}
                />
                {t("settings.workspace.general.companyBannerBold")}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={workspace.companyBannerItalic}
                  onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerItalic: e.target.checked })}
                />
                {t("settings.workspace.general.companyBannerItalic")}
              </label>
            </div>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={workspace.companyBannerLetterSpacing}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerLetterSpacing: e.target.checked })}
              />
              {t("settings.workspace.general.companyBannerLetterSpacing")}
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{t("settings.workspace.general.companyBannerTextAlign")}</span>
              <select
                value={workspace.companyBannerTextAlign}
                onChange={(e) =>
                  updateCompanyBannerMutation.mutate({
                    companyBannerTextAlign: e.target.value as "left" | "center" | "right",
                  })
                }
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value="left">{t("settings.workspace.general.alignLeft")}</option>
                <option value="center">{t("settings.workspace.general.alignCenter")}</option>
                <option value="right">{t("settings.workspace.general.alignRight")}</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={workspace.companyBannerFadeEnabled}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerFadeEnabled: e.target.checked })}
              />
              {t("settings.workspace.general.companyBannerFadeEnabled")}
            </label>

            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={workspace.companyBannerGradientEnabled}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerGradientEnabled: e.target.checked })}
              />
              {t("settings.workspace.general.companyBannerGradientEnabled")}
            </label>

            {workspace.companyBannerGradientEnabled && (
              <div className="space-y-2 border-l-2 border-border pl-3">
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span>{t("settings.workspace.general.companyBannerBackgroundColor2")}</span>
                  <input
                    type="color"
                    value={workspace.companyBannerBackgroundColor2 ?? "#f8fafc"}
                    onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerBackgroundColor2: e.target.value })}
                    className="h-7 w-14 rounded border border-border"
                    aria-label={t("settings.workspace.general.companyBannerBackgroundColor2")}
                  />
                </label>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{t("settings.workspace.general.companyBannerGradientAngle")}</span>
                    <span className="text-ink-muted">{companyBannerGradientAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={companyBannerGradientAngle}
                    onChange={(e) => setCompanyBannerGradientAngleDraft(Number(e.target.value))}
                    onPointerUp={(e) => updateCompanyBannerGradientAngleMutation.mutate(Number(e.currentTarget.value))}
                    onKeyUp={(e) => updateCompanyBannerGradientAngleMutation.mutate(Number(e.currentTarget.value))}
                    className="w-full accent-accent"
                    aria-label={t("settings.workspace.general.companyBannerGradientAngle")}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{t("settings.workspace.general.companyBannerGradientStartPosition")}</span>
                    <span className="text-ink-muted">{companyBannerGradientStartPosition}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={companyBannerGradientStartPosition}
                    onChange={(e) => setCompanyBannerGradientStartDraft(Number(e.target.value))}
                    onPointerUp={(e) => updateCompanyBannerGradientStartMutation.mutate(Number(e.currentTarget.value))}
                    onKeyUp={(e) => updateCompanyBannerGradientStartMutation.mutate(Number(e.currentTarget.value))}
                    className="w-full accent-accent"
                    aria-label={t("settings.workspace.general.companyBannerGradientStartPosition")}
                  />
                </div>

                <div
                  className="w-full rounded-lg"
                  style={{
                    height: 32,
                    background: `linear-gradient(${companyBannerGradientAngle}deg, ${workspace.companyBannerBackgroundColor ?? "#f8fafc"} ${companyBannerGradientStartPosition}%, ${workspace.companyBannerBackgroundColor2 ?? workspace.companyBannerBackgroundColor ?? "#f8fafc"} 100%)`,
                  }}
                />
              </div>
            )}

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={workspace.companyBannerTextShadow}
                onChange={(e) => updateCompanyBannerMutation.mutate({ companyBannerTextShadow: e.target.checked })}
              />
              {t("settings.workspace.general.companyBannerTextShadow")}
            </label>

            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{t("settings.workspace.general.companyBannerFontFamily")}</span>
              <select
                value={workspace.companyBannerFontFamily ?? ""}
                onChange={(e) =>
                  updateCompanyBannerMutation.mutate({
                    companyBannerFontFamily: e.target.value
                      ? (e.target.value as Workspace["companyBannerFontFamily"])
                      : null,
                  })
                }
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value="">{t("settings.workspace.general.companyBannerFontFamilyDefault")}</option>
                {FONT_FAMILY_OPTIONS.filter((option) => option.value !== "default").map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
