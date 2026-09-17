export const FALLBACK_TIMEZONES = [
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "UTC",
] as const;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function isValidTimeZone(value: string) {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones({
  storedZone,
  browserZone,
  supportedValuesOf,
}: {
  storedZone?: string;
  browserZone?: string;
  supportedValuesOf?: () => string[];
} = {}) {
  let zones: string[];
  try {
    const provider = supportedValuesOf
      ?? (() => (Intl as IntlWithSupportedValues).supportedValuesOf?.("timeZone") ?? []);
    const supported = provider();
    zones = supported.length ? supported : [...FALLBACK_TIMEZONES];
  } catch {
    zones = [...FALLBACK_TIMEZONES];
  }

  for (const candidate of [storedZone, browserZone]) {
    if (candidate && isValidTimeZone(candidate)) zones.push(candidate);
  }

  return [...new Set(zones.filter(isValidTimeZone))]
    .sort((a, b) => a.localeCompare(b));
}

export function suggestedTimeZone({
  currentZone,
  browserZone,
  touched,
}: {
  currentZone: string;
  browserZone?: string;
  touched: boolean;
}) {
  return !touched && browserZone && isValidTimeZone(browserZone)
    ? browserZone
    : currentZone;
}
