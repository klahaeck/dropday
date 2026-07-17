import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, LockKeyhole, Users } from "lucide-react";
import { Pill } from "@/components/pill";
import { getClubAccentForeground, normalizeClubAccent } from "@/lib/club-accent";
import type { Club } from "@/types/domain";

export function ClubCard({ club, membershipLabel }: { club: Club; membershipLabel?: "member" | "owner" }) {
  const accent = normalizeClubAccent(club.accent);
  return (
    <Link href={`/app/clubs/${club.slug}`} className="club-card" style={{ "--club-accent": accent, "--club-accent-ink": getClubAccentForeground(accent) } as React.CSSProperties}>
      <div className="club-card-art" aria-hidden="true">
        {club.imageUrl ? <Image src={club.imageUrl} alt="" fill sizes="145px" unoptimized /> : <><span>{club.name.slice(0, 1)}</span><i /></>}
      </div>
      <div className="club-card-copy">
        <div className="eyebrow-row">
          <Pill tone={club.visibility === "private" ? "dark" : "green"}>
            {club.visibility === "private" && <LockKeyhole size={12} />} {club.visibility}
          </Pill>
          {membershipLabel && <span className="tiny-label">{membershipLabel}</span>}
        </div>
        <h3>{club.name}</h3>
        <p>{club.description}</p>
        <div className="club-card-meta">
          <span><Users size={15} /> {club.memberCount}</span>
          <span>{club.schedule.rrule.replace("FREQ=", "").split(";")[0].toLowerCase()}</span>
          <ArrowUpRight size={17} className="card-arrow" />
        </div>
      </div>
    </Link>
  );
}
