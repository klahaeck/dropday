import { redirect } from "next/navigation";
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
import type { UserProfile } from "@/types/domain";

export interface Viewer {
  profile: UserProfile;
  features: ProductFeatureAccess;
  isDemo: boolean;
}

export async function getViewer(): Promise<Viewer | null> {
  if (!integrations.clerk) {
    const profile = demoUsers[0];
    return { profile, features: featureAccessForPlan(profile.plan), isDemo: true };
  }

  const [{ auth, currentUser }] = await Promise.all([import("@clerk/nextjs/server")]);
  const session = await auth();
  if (!session.userId) return null;
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "Dropday member";
  const checkPlan = (planSlug: string) => session.has({ plan: planSlug });
  const checkFeature = (featureSlug: string) => session.has({ feature: featureSlug });
  const clerkPlan = planFromClerkChecks(checkPlan, checkFeature);
  const complimentaryPlan = planFromPrivateMetadata(clerkUser.privateMetadata);
  const plan = highestPlan(clerkPlan, complimentaryPlan);
  const features = featureAccessFromClerkChecks(checkFeature, clerkPlan, complimentaryPlan);
  const timestamp = new Date().toISOString();
  const db = integrations.mongo ? await getDb() : null;
  const existingProfile = db
    ? await db.collection<UserProfile>("users").findOne({ clerkUserId: clerkUser.id })
    : null;
  const profile: UserProfile = {
    id: clerkUser.id,
    clerkUserId: clerkUser.id,
    displayName,
    initials: displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    imageUrl: clerkUser.imageUrl,
    primaryEmail: clerkUser.primaryEmailAddress?.emailAddress,
    plan,
    emailNotifications: existingProfile?.emailNotifications ?? true,
    themePreference: existingProfile?.themePreference ?? "system",
    createdAt: existingProfile?.createdAt ?? new Date(clerkUser.createdAt).toISOString(),
    updatedAt: timestamp,
  };

  if (db) {
    await db.collection<UserProfile>("users").updateOne(
      { clerkUserId: clerkUser.id },
      { $set: profile },
      { upsert: true },
    );
  }
  return { profile, features, isDemo: false };
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}
