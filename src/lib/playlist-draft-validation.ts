import {
  PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH,
  PLAYLIST_DESCRIPTION_MAX_LENGTH,
  playlistDescriptionToText,
  sanitizePlaylistDescriptionHtml,
} from "@/lib/playlist-description";
import { normalizePlaylistUrl } from "@/lib/playlist-providers";

export type PlaylistDraftField = "spotifyUrl" | "appleMusicUrl" | "title" | "description";

export type PlaylistDraftFieldErrors = Partial<Record<PlaylistDraftField, string>>;

export type ValidatedPlaylistDraft = {
  spotifyUrl?: string;
  appleMusicUrl?: string;
  legacyUrl?: string;
  title: string;
  description: string;
  descriptionHtml: string;
};

export type PlaylistDraftValidationResult =
  | { success: true; data: ValidatedPlaylistDraft; errors: PlaylistDraftFieldErrors }
  | { success: false; errors: PlaylistDraftFieldErrors };

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateProviderUrl(
  value: string,
  expectedProvider: "spotify" | "apple-music",
  field: PlaylistDraftField,
  errors: PlaylistDraftFieldErrors,
) {
  if (!value) return;
  const providerLabel = expectedProvider === "spotify" ? "Spotify" : "Apple Music";
  if (value.length > 500) {
    errors[field] = `Keep the ${providerLabel} playlist URL to 500 characters or fewer.`;
    return;
  }
  try {
    const normalized = normalizePlaylistUrl(value);
    if (normalized.provider !== expectedProvider) {
      const article = expectedProvider === "spotify" ? "a" : "an";
      errors[field] = `Use ${article} ${providerLabel} playlist URL in the ${providerLabel} field.`;
    }
  } catch (error) {
    errors[field] = error instanceof Error ? error.message : `Enter a valid ${providerLabel} playlist URL.`;
  }
}

export function validatePlaylistDraft(input: {
  spotifyUrl?: unknown;
  appleMusicUrl?: unknown;
  url?: unknown;
  title?: unknown;
  descriptionHtml?: unknown;
}): PlaylistDraftValidationResult {
  const spotifyUrl = stringValue(input.spotifyUrl);
  const appleMusicUrl = stringValue(input.appleMusicUrl);
  const legacyUrl = stringValue(input.url);
  const title = stringValue(input.title);
  const rawDescriptionHtml = typeof input.descriptionHtml === "string" ? input.descriptionHtml : "";
  const errors: PlaylistDraftFieldErrors = {};

  validateProviderUrl(spotifyUrl, "spotify", "spotifyUrl", errors);
  validateProviderUrl(appleMusicUrl, "apple-music", "appleMusicUrl", errors);

  if (!spotifyUrl && !appleMusicUrl && !legacyUrl) {
    errors.spotifyUrl = "Add a Spotify or Apple Music playlist URL.";
  } else if (legacyUrl) {
    if (legacyUrl.length > 500) {
      errors.spotifyUrl = "Keep playlist URLs to 500 characters or fewer.";
    } else {
      try {
        normalizePlaylistUrl(legacyUrl);
      } catch (error) {
        errors.spotifyUrl = error instanceof Error ? error.message : "Enter a valid playlist URL.";
      }
    }
  }

  if (title.length < 2) {
    errors.title = "Add a playlist title of at least 2 characters.";
  } else if (title.length > 100) {
    errors.title = "Keep the playlist title to 100 characters or fewer.";
  }

  let descriptionHtml = rawDescriptionHtml;
  let description = "";
  if (rawDescriptionHtml.length > PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH) {
    errors.description = "This description has too much formatting. Simplify it and try again.";
  } else {
    descriptionHtml = sanitizePlaylistDescriptionHtml(rawDescriptionHtml);
    description = playlistDescriptionToText(descriptionHtml).trim();
    if (description.length < 2) {
      errors.description = "Add a description before saving this playlist.";
    } else if (description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) {
      errors.description = `Keep the description to ${PLAYLIST_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.`;
    }
  }

  if (Object.keys(errors).length) return { success: false, errors };
  return {
    success: true,
    errors,
    data: {
      spotifyUrl: spotifyUrl || undefined,
      appleMusicUrl: appleMusicUrl || undefined,
      legacyUrl: legacyUrl || undefined,
      title,
      description,
      descriptionHtml,
    },
  };
}

export function firstPlaylistDraftError(errors: PlaylistDraftFieldErrors) {
  const order: PlaylistDraftField[] = ["spotifyUrl", "appleMusicUrl", "title", "description"];
  const field = order.find((candidate) => errors[candidate]);
  return field ? { field, error: errors[field]! } : undefined;
}
