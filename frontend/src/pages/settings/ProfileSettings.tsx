import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Loader2Icon, UserRoundIcon } from "lucide-react";
import { Link } from "react-router";
import toast from "react-hot-toast";
import { apiService } from "@/services/apiService";
import { useAuthStore } from "@/store/useAuthStore";
import type { ProfileResponse } from "@/types/api";
import { handleStoreError } from "@/utils/errorHandling";
import { isDefaultAvatar, validateAvatarFile } from "@/utils/avatar";
import { MAX_UPLOAD_LABEL } from "@/utils/uploads";
import {
  primaryButtonClass,
  secondaryButtonClass,
  SettingsCard,
  SettingsSection,
} from "@/components/settings/SettingsSection";

// The update endpoint's limits; sign-up allows longer names.
const NAME_MIN = 2;
const NAME_MAX = 50;

const validateName = (name: string) => {
  if (name.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  return null;
};

function PhotoCard() {
  const authUser = useAuthStore((state) => state.authUser);
  const updateAuthUser = useAuthStore((state) => state.updateAuthUser);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (!authUser) return null;
  const photo = preview ?? authUser.profilePic;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const problem = validateAvatarFile(file);
    setError(problem);
    if (problem) return;

    setPreview(URL.createObjectURL(file));
    setPending("upload");
    try {
      const response = await apiService.uploadFile<ProfileResponse>(
        "/users/update-profile-image",
        file,
        undefined,
        "profileImage",
        undefined,
        "put",
      );
      updateAuthUser(response.user);
      toast.success("Profile photo updated");
    } catch (e) {
      handleStoreError(e, "Couldn't upload the photo. Try again later.");
    } finally {
      setPreview(null);
      setPending(null);
    }
  };

  const remove = async () => {
    setError(null);
    setPending("remove");
    try {
      const response = await apiService.delete<ProfileResponse>("/users/profile-image");
      updateAuthUser(response.user);
      toast.success("Profile photo removed");
    } catch (e) {
      handleStoreError(e, "Couldn't remove the photo. Try again later.");
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsCard title="Profile photo" description={`JPG, PNG or WebP, up to ${MAX_UPLOAD_LABEL}.`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700/70 ring-1 ring-slate-600/40">
          {photo ? (
            <img src={photo} alt="Your profile photo" className="size-full object-cover" />
          ) : (
            <UserRoundIcon className="size-8 text-slate-300" aria-hidden="true" />
          )}
          {pending === "upload" && (
            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/50">
              <Loader2Icon className="size-6 animate-spin text-cyan-300" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={upload}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={pending !== null}
            onClick={() => fileInput.current?.click()}
          >
            {pending === "upload" ? "Uploading…" : "Upload photo"}
          </button>
          {!isDefaultAvatar(authUser.profilePic) && (
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={pending !== null}
              onClick={remove}
            >
              {pending === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </SettingsCard>
  );
}

function NameCard() {
  const authUser = useAuthStore((state) => state.authUser);
  const updateAuthUser = useAuthStore((state) => state.updateAuthUser);
  const [name, setName] = useState(authUser?.fullName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!authUser) return null;
  const trimmed = name.trim();
  const isChanged = trimmed !== authUser.fullName;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateName(trimmed);
    setError(problem);
    if (problem || !isChanged) return;

    setIsSaving(true);
    try {
      const response = await apiService.put<ProfileResponse>("/users/update-profile", {
        fullName: trimmed,
      });
      updateAuthUser(response.user);
      setName(response.user.fullName);
      toast.success("Name updated");
    } catch (e) {
      handleStoreError(e, "Couldn't update your name. Try again later.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard title="Name" description="Shown to people you chat with.">
      <form onSubmit={save} noValidate className="space-y-3">
        <label htmlFor="settings-full-name" className="auth-input-label">
          Full name
        </label>
        <input
          id="settings-full-name"
          name="fullName"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="name"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "settings-full-name-error" : undefined}
          className={`auth-input pl-4 ${error ? "border-red-500 focus:ring-red-500" : ""}`}
        />
        {error && (
          <p id="settings-full-name-error" role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClass} disabled={!isChanged || isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </button>
          {isChanged && !isSaving && (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setName(authUser.fullName);
                setError(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}

function ProfileSettings() {
  const email = useAuthStore((state) => state.authUser?.email);

  return (
    <SettingsSection title="Profile" description="How others see you in Convo">
      <PhotoCard />
      <NameCard />
      <SettingsCard title="Email" description="Used to sign in. Only you can see it.">
        <p className="break-all text-sm text-slate-200">{email}</p>
        <Link to="/settings/account" className={`${secondaryButtonClass} mt-3`}>
          Change email
        </Link>
      </SettingsCard>
    </SettingsSection>
  );
}

export default ProfileSettings;
