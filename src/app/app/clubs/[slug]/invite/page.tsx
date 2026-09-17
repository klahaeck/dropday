import { InvitationExchange } from "@/components/invitation-exchange";
import { requireViewer } from "@/lib/auth";

export default async function ClubInvitationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireViewer();
  return <InvitationExchange clubSlug={slug} />;
}
