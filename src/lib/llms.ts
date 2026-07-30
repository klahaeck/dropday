function siteOrigin(appUrl: string) {
  return new URL(appUrl).origin;
}

export function buildLlmsText(appUrl: string) {
  const origin = siteOrigin(appUrl);

  return `# Dropday

> Dropday is a social playlist-club app where friends take turns sharing Spotify or Apple Music playlists on a recurring schedule.

Dropday organizes the listening ritual; it is not a music streaming service. Members create public or private clubs, prepare playlists, follow a visible rotation, and discuss each drop in its own chat. Club owners can choose a timezone-aware cadence, set themes, manage the queue, and prepare backup playlists.

Important facts:
- Listener accounts can join up to three clubs for free and prepare unlimited playlists.
- Paid plans allow members to host clubs and join an unlimited number of clubs.
- Spotify and Apple Music remain the sources for playlist playback.
- Prices and billing periods are shown on the live pricing page.
- Private club content and member conversations require access to the relevant club.

## Public pages

- [Dropday home](${origin}/): Product overview, core features, and how playlist clubs work.
- [Pricing](${origin}/pricing): Current plan names, hosting limits, and live billing options.
- [Privacy Policy](${origin}/privacy): How Dropday handles account, club, playlist, and notification data.
- [Terms of Use](${origin}/terms): Rules for accounts, clubs, member content, plans, and third-party music services.

## Get started

- [Create a Dropday account](${origin}/sign-up): Join an existing rotation or prepare playlists.
- [Contact Dropday](mailto:hello@dropday.app): Product and support questions.
`;
}
