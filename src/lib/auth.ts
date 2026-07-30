import { redirect } from "next/navigation";
import { hasSuperAdminAccess } from "@/lib/clerk-metadata";
import { integrations } from "@/lib/env";
import { demoUsers } from "@/lib/demo-data";
import { getDb } from "@/lib/db";
import {
  featureAccessForPlan,
  featureAccessFromClerkChecks,
  highestPlan,
  planFromClerkChecks,
  planFromPrivateMetadata,
  type ProductFeatureAccess,
} from "@/lib/entitlements";
import { DEFAULT_SKIN } from "@/lib/skin";
import {
  persistWithUniqueUserName,
  resolveUserName,
  type ResolvedUserName,
} from "@/lib/user-name";
import type { UserProfile } from "@/types/domain";

export interface Viewer {
  profile: UserProfile;
  features: ProductFeatureAccess;
  isDemo: boolean;
  isSuperAdmin: boolean;
}

export async function getViewer(): Promise<Viewer | null> {
  if (!integrations.clerk) {
    const profile = demoUsers[0];
    return {
      profile,
      features: featureAccessForPlan(profile.plan),
      isDemo: true,
      isSuperAdmin: false,
    };
  }

  const [{ auth, currentUser }] = await Promise.all([import("@clerk/nextjs/server")]);
  const session = await auth();
  if (!session.userId) return null;
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const checkPlan = (planSlug: string) => session.has({ plan: planSlug });
  const checkFeature = (featureSlug: string) => session.has({ feature: featureSlug });
  const clerkPlan = planFromClerkChecks(checkPlan, checkFeature);
  const complimentaryPlan = planFromPrivateMetadata(clerkUser.privateMetadata);
  const isSuperAdmin = hasSuperAdminAccess(clerkUser.privateMetadata);
  const plan = highestPlan(clerkPlan, complimentaryPlan);
  const features = featureAccessFromClerkChecks(checkFeature, clerkPlan, complimentaryPlan);
  const timestamp = new Date().toISOString();
  const db = integrations.mongo ? await getDb() : null;
  const existingProfile = db
    ? await db.collection<UserProfile>("users").findOne({ clerkUserId: clerkUser.id })
    : null;
  const identity = {
    userId: clerkUser.id,
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
  };
  const baseProfile = {
    id: clerkUser.id,
    clerkUserId: clerkUser.id,
    imageUrl: clerkUser.imageUrl,
    primaryEmail: clerkUser.primaryEmailAddress?.emailAddress,
    plan,
    emailNotifications: existingProfile?.emailNotifications ?? true,
    emailPreferences: existingProfile?.emailPreferences,
    themePreference: existingProfile?.themePreference ?? "system",
    skinPreference: existingProfile?.skinPreference ?? DEFAULT_SKIN,
    createdAt: existingProfile?.createdAt ?? new Date(clerkUser.createdAt).toISOString(),
    updatedAt: timestamp,
  };

  const buildProfile = (name: ResolvedUserName): UserProfile => ({
    ...baseProfile,
    firstName: name.firstName,
    lastName: name.lastName,
    displayName: name.displayName,
    initials: name.initials,
    ...(name.generatedNameKey ? { generatedNameKey: name.generatedNameKey } : {}),
  });
  const profile = db
    ? (await persistWithUniqueUserName<UserProfile>({
      identity,
      existing: existingProfile,
      persist: async (name) => {
        const nextProfile = buildProfile(name);
        await db.collection<UserProfile>("users").updateOne(
          { clerkUserId: clerkUser.id },
          {
            $set: nextProfile,
            ...(!name.generatedNameKey ? { $unset: { generatedNameKey: "" } } : {}),
          },
          { upsert: true },
        );
        return nextProfile;
      },
    })).result
    : buildProfile(resolveUserName(identity));

  return { profile, features, isDemo: false, isSuperAdmin };
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    if (integrations.clerk) {
      const { auth } = await import("@clerk/nextjs/server");
      const session = await auth();
      return session.redirectToSignIn();
    }
    redirect("/sign-in");
  }
  return viewer;
}
