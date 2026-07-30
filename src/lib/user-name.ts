const QUIRKY_FIRST_NAMES = [
  "Bouncy",
  "Breezy",
  "Bright",
  "Bubbly",
  "Cosmic",
  "Curious",
  "Dapper",
  "Daring",
  "Dazzling",
  "Dizzy",
  "Electric",
  "Fizzy",
  "Fluffy",
  "Fuzzy",
  "Gleeful",
  "Glimmering",
  "Groovy",
  "Jazzy",
  "Jolly",
  "Lunar",
  "Mellow",
  "Merry",
  "Mighty",
  "Minty",
  "Neon",
  "Nimble",
  "Nifty",
  "Peppy",
  "Perky",
  "Plucky",
  "Polka",
  "Quirky",
  "Radiant",
  "Roving",
  "Sassy",
  "Shiny",
  "Silly",
  "Snappy",
  "Sparkly",
  "Sprightly",
  "Sunny",
  "Tangy",
  "Tidy",
  "Twinkly",
  "Velvet",
  "Wandering",
  "Whimsical",
  "Wiggly",
  "Witty",
  "Wobbly",
  "Zany",
  "Zesty",
  "Amber",
  "Brisk",
  "Cheery",
  "Dreamy",
  "Fancy",
  "Feisty",
  "Giddy",
  "Kooky",
  "Lucky",
  "Rosy",
  "Toasty",
  "Vivid",
] as const;

const QUIRKY_LAST_NAMES = [
  "Badger",
  "Banjo",
  "Beetle",
  "Biscuit",
  "Bumblebee",
  "Cactus",
  "Capybara",
  "Carousel",
  "Comet",
  "Crumpet",
  "Disco",
  "Dumpling",
  "Firefly",
  "Flamingo",
  "Fox",
  "Gnome",
  "Hedgehog",
  "Jellybean",
  "Kazoo",
  "Koala",
  "Llama",
  "Marmot",
  "Moonbeam",
  "Narwhal",
  "Otter",
  "Pancake",
  "Parrot",
  "Pebble",
  "Pickle",
  "Puffin",
  "Raccoon",
  "Rocket",
  "Scooter",
  "Sprout",
  "Stardust",
  "Teacup",
  "Walrus",
  "Wombat",
  "Acorn",
  "Alpaca",
  "Bagel",
  "Balloon",
  "Bonbon",
  "Button",
  "Canary",
  "Coconut",
  "Cricket",
  "Cupcake",
  "Doodle",
  "Dragonfly",
  "Fiddle",
  "Goldfish",
  "Gumdrop",
  "Honeybee",
  "Lantern",
  "Marshmallow",
  "Noodle",
  "Pecan",
  "Penguin",
  "Popcorn",
  "Robin",
  "Sparrow",
  "Tambourine",
  "Turnip",
] as const;

export interface UserNameIdentity {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ResolvedUserName {
  firstName: string;
  lastName: string;
  displayName: string;
  initials: string;
  generatedNameKey?: string;
}

interface ExistingGeneratedUserName {
  firstName?: string;
  lastName?: string;
  displayName: string;
  initials: string;
  generatedNameKey?: string;
}

function cleanNamePart(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned || undefined;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
}

function candidateCount(identity: UserNameIdentity): number {
  const firstName = cleanNamePart(identity.firstName);
  const lastName = cleanNamePart(identity.lastName);
  if (!firstName && !lastName) return QUIRKY_FIRST_NAMES.length * QUIRKY_LAST_NAMES.length;
  if (!firstName) return QUIRKY_FIRST_NAMES.length;
  if (!lastName) return QUIRKY_LAST_NAMES.length;
  return 1;
}

export function resolveUserName(identity: UserNameIdentity, attempt = 0): ResolvedUserName {
  const suppliedFirstName = cleanNamePart(identity.firstName);
  const suppliedLastName = cleanNamePart(identity.lastName);
  const needsGeneratedName = !suppliedFirstName || !suppliedLastName;
  const seed = stableHash(identity.userId);

  let firstName = suppliedFirstName;
  let lastName = suppliedLastName;
  if (!firstName && !lastName) {
    const combinationCount = QUIRKY_FIRST_NAMES.length * QUIRKY_LAST_NAMES.length;
    const combination = (seed + attempt) % combinationCount;
    firstName = QUIRKY_FIRST_NAMES[combination % QUIRKY_FIRST_NAMES.length];
    lastName = QUIRKY_LAST_NAMES[Math.floor(combination / QUIRKY_FIRST_NAMES.length)];
  } else if (!firstName) {
    firstName = QUIRKY_FIRST_NAMES[(seed + attempt) % QUIRKY_FIRST_NAMES.length];
  } else if (!lastName) {
    lastName = QUIRKY_LAST_NAMES[(seed + attempt) % QUIRKY_LAST_NAMES.length];
  }

  if (!firstName || !lastName) {
    throw new Error("Dropday could not resolve a complete user name");
  }
  const displayName = `${firstName} ${lastName}`;
  return {
    firstName,
    lastName,
    displayName,
    initials: initialsFor(firstName, lastName),
    ...(needsGeneratedName
      ? { generatedNameKey: `quirky:${displayName.toLowerCase()}` }
      : {}),
  };
}

function canReuseGeneratedName(
  identity: UserNameIdentity,
  existing: ExistingGeneratedUserName | null | undefined,
): existing is Required<ExistingGeneratedUserName> {
  if (!existing?.generatedNameKey || !existing.firstName || !existing.lastName) return false;
  const suppliedFirstName = cleanNamePart(identity.firstName);
  const suppliedLastName = cleanNamePart(identity.lastName);
  return (!suppliedFirstName || suppliedFirstName === existing.firstName)
    && (!suppliedLastName || suppliedLastName === existing.lastName);
}

export function isGeneratedNameCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const duplicate = error as {
    code?: unknown;
    keyPattern?: Record<string, unknown>;
    message?: unknown;
  };
  return duplicate.code === 11000
    && (
      duplicate.keyPattern?.generatedNameKey === 1
      || (typeof duplicate.message === "string"
        && (
          duplicate.message.includes("generatedNameKey")
          || duplicate.message.includes("unique_generated_user_name")
        ))
    );
}

export async function persistWithUniqueUserName<T>({
  identity,
  existing,
  persist,
}: {
  identity: UserNameIdentity;
  existing?: ExistingGeneratedUserName | null;
  persist: (name: ResolvedUserName) => Promise<T>;
}): Promise<{ name: ResolvedUserName; result: T }> {
  if (canReuseGeneratedName(identity, existing)) {
    const name: ResolvedUserName = {
      firstName: existing.firstName,
      lastName: existing.lastName,
      displayName: existing.displayName,
      initials: existing.initials,
      generatedNameKey: existing.generatedNameKey,
    };
    try {
      return { name, result: await persist(name) };
    } catch (error) {
      if (!isGeneratedNameCollision(error)) throw error;
    }
  }

  const attempts = candidateCount(identity);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const name = resolveUserName(identity, attempt);
    try {
      return { name, result: await persist(name) };
    } catch (error) {
      if (!isGeneratedNameCollision(error)) throw error;
    }
  }

  throw new Error("Dropday could not allocate a unique generated user name");
}
