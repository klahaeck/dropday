import { CLUB_DESCRIPTION_HTML_MAX_LENGTH, CLUB_DESCRIPTION_MAX_LENGTH } from "@/lib/club-description";
import { isValidTimeZone } from "@/lib/timezones";
import type { ClubVisibility, RecurrenceConfig } from "@/types/domain";

export const DEFAULT_CLUB_VISIBILITY: ClubVisibility = "private";

export const CLUB_CREATION_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "ritual", label: "Ritual" },
  { id: "finish", label: "Optional finish" },
] as const;

export type ClubCreationStep = typeof CLUB_CREATION_STEPS[number]["id"];
export type ClubCreationField =
  | "name"
  | "description"
  | "startsOn"
  | "localTime"
  | "timezone"
  | "frequency"
  | "interval"
  | "theme";

export interface ClubCreationValues {
  name: string;
  description: string;
  descriptionHtml: string;
  startsOn: string;
  localTime: string;
  timezone: string;
  frequency: RecurrenceConfig["frequency"] | string;
  interval: string;
  useTheme: boolean;
  theme: string;
}

export interface ClubCreationValidationError {
  field: ClubCreationField;
  message: string;
}

export function nextClubCreationStep(step: ClubCreationStep) {
  const index = CLUB_CREATION_STEPS.findIndex((candidate) => candidate.id === step);
  return CLUB_CREATION_STEPS[Math.min(index + 1, CLUB_CREATION_STEPS.length - 1)].id;
}

export function previousClubCreationStep(step: ClubCreationStep) {
  const index = CLUB_CREATION_STEPS.findIndex((candidate) => candidate.id === step);
  return CLUB_CREATION_STEPS[Math.max(index - 1, 0)].id;
}

export function validateClubCreationStep(
  step: ClubCreationStep,
  values: ClubCreationValues,
): ClubCreationValidationError[] {
  if (step === "identity") {
    const name = values.name.trim();
    const description = values.description.trim();
    if (name.length < 2 || name.length > 70) {
      return [{ field: "name", message: "Enter a club name between 2 and 70 characters." }];
    }
    if (description.length < 10) {
      return [{ field: "description", message: "Add a description of at least 10 characters." }];
    }
    if (description.length > CLUB_DESCRIPTION_MAX_LENGTH) {
      return [{ field: "description", message: `Keep the description to ${CLUB_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer.` }];
    }
    if (values.descriptionHtml.length > CLUB_DESCRIPTION_HTML_MAX_LENGTH) {
      return [{ field: "description", message: "Simplify the description formatting and try again." }];
    }
    return [];
  }

  if (step === "ritual") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startsOn)) {
      return [{ field: "startsOn", message: "Choose the ritual start date." }];
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.localTime)) {
      return [{ field: "localTime", message: "Choose a valid ritual start time." }];
    }
    if (!isValidTimeZone(values.timezone)) {
      return [{ field: "timezone", message: "Choose a valid IANA timezone." }];
    }
    if (!(["daily", "weekly", "monthly"] as string[]).includes(values.frequency)) {
      return [{ field: "frequency", message: "Choose how often the ritual repeats." }];
    }
    const interval = Number(values.interval);
    if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
      return [{ field: "interval", message: "Choose a repeat interval from 1 to 52." }];
    }
    return [];
  }

  if (values.useTheme && (values.theme.trim().length < 2 || values.theme.trim().length > 100)) {
    return [{ field: "theme", message: "Enter a theme name between 2 and 100 characters." }];
  }
  return [];
}

export function shouldWarnAboutUnsavedClub({
  dirty,
  created,
}: {
  dirty: boolean;
  created: boolean;
}) {
  return dirty && !created;
}
