import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ClubCreationSuccess, CreateClubForm } from "@/components/interactive-forms";

describe("CreateClubForm", () => {
  it("renders the labelled first step, private default, and one final create control", () => {
    const html = renderToStaticMarkup(createElement(CreateClubForm, {
      canOwn: true,
      ownerId: "user-1",
    }));

    expect(html).toContain('aria-label="Club creation progress"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("01 · Identity");
    expect(html).toContain('<option value="private" selected="">Private · link or invite only</option>');
    expect(html.match(/Create club/g)).toHaveLength(1);
  });

  it("renders partial success as recovery links without another submission form", () => {
    const warning = "The club was created, but its first drop tasks still need to be scheduled.";
    const html = renderToStaticMarkup(createElement(ClubCreationSuccess, {
      slug: "needle-exchange",
      warning,
    }));

    expect(html).toContain(warning);
    expect(html).toContain('href="/app/clubs/needle-exchange"');
    expect(html).toContain('href="/app/clubs/needle-exchange/settings#schedule"');
    expect(html).not.toContain("<form");
  });
});
