import Image from "next/image";
import type { UserProfile } from "@/types/domain";

export function Avatar({
  user,
  size = "medium",
}: {
  user?: Pick<UserProfile, "displayName" | "initials" | "imageUrl">;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span className={`avatar avatar-${size}`} title={user?.displayName ?? "Dropday member"}>
      {user?.imageUrl ? <Image src={user.imageUrl} alt="" fill sizes={size === "small" ? "32px" : size === "large" ? "58px" : "40px"} unoptimized /> : <span>{user?.initials ?? "DD"}</span>}
    </span>
  );
}

export function AvatarStack({ users }: { users: Array<Pick<UserProfile, "id" | "displayName" | "initials" | "imageUrl">> }) {
  return (
    <span className="avatar-stack" aria-label={`${users.length} members`}>
      {users.slice(0, 4).map((user) => <Avatar key={user.id} user={user} size="small" />)}
      {users.length > 4 && <span className="avatar avatar-small avatar-count">+{users.length - 4}</span>}
    </span>
  );
}
