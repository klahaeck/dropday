import Link from "next/link";

function RecordMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="13" fill="#f4f0e6" />
      <circle cx="32" cy="32" r="24" fill="#171713" />
      <g fill="none" stroke="#5d5a52" strokeWidth="0.8">
        <circle cx="32" cy="32" r="20.5" />
        <circle cx="32" cy="32" r="17.5" />
        <circle cx="32" cy="32" r="14.5" />
      </g>
      <path
        d="M17.2 18.3a20.5 20.5 0 0 1 21.6-5.8M46.7 43.8a20.5 20.5 0 0 1-21.4 7"
        fill="none"
        stroke="#fffdf8"
        strokeLinecap="round"
        strokeWidth="1.15"
        opacity="0.24"
      />
      <circle cx="32" cy="32" r="9.2" fill="#ff5c35" />
      <circle cx="32" cy="32" r="6.2" fill="none" stroke="#c94327" strokeWidth="0.7" />
      <path d="M28.2 25.8a7.4 7.4 0 0 1 7.7.1" fill="none" stroke="#fffdf8" strokeLinecap="round" strokeWidth="0.9" opacity="0.42" />
      <circle cx="32" cy="32" r="1.8" fill="#f4f0e6" />
    </svg>
  );
}

export function Brand({
  href = "/",
  compact = false,
  onClick,
}: {
  href?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} className="brand" aria-label="Dropday home" onClick={onClick}>
      <span className="brand-mark"><RecordMark /></span>
      {!compact && <span className="brand-name">dropday</span>}
    </Link>
  );
}
