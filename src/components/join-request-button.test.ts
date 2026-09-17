import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinRequestButton } from "@/components/join-request-button";

describe("join request controls", () => {
  it("shows an optional 500-character message before requesting", () => {
    const markup = renderToStaticMarkup(createElement(JoinRequestButton, {
      clubId: "club-1",
    }));

    expect(markup).toContain("Message");
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain('class="field field-full"');
    expect(markup).toContain('class="field-counter"');
    expect(markup).toContain('class="form-actions"');
    expect(markup).toContain("Request to join");
  });

  it("shows withdrawal after a pending request", () => {
    const markup = renderToStaticMarkup(createElement(JoinRequestButton, {
      clubId: "club-1",
      initialRequest: { id: "join-1", message: "My note" },
    }));

    expect(markup).toContain("Withdraw request");
    expect(markup).toContain("My note");
  });

  it("links a blocked requester to working membership management", () => {
    const markup = renderToStaticMarkup(createElement(JoinRequestButton, {
      clubId: "club-1",
      initialBlocked: true,
    }));

    expect(markup).toContain("Membership limit reached");
    expect(markup).toContain('href="/app/clubs#manage-memberships"');
    expect(markup).toContain("Manage memberships");
  });
});
