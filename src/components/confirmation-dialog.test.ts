import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

describe("ConfirmationDialog", () => {
  it("renders an explicitly labelled modal with a safe cancel action", () => {
    const html = renderToStaticMarkup(createElement(ConfirmationDialog, {
      open: true,
      title: "Transfer ownership?",
      description: createElement("p", null, "You will become an admin."),
      confirmLabel: "Transfer ownership",
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Transfer ownership?");
    expect(html).toContain("You will become an admin.");
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(">Transfer ownership</button>");
  });

  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(createElement(ConfirmationDialog, {
      open: false,
      title: "Confirm",
      description: "Description",
      confirmLabel: "Continue",
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }));
    expect(html).toBe("");
  });
});
