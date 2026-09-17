import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

describe("ConfirmationDialog interactions", () => {
  it("moves focus to the safe action and handles keyboard cancellation", async () => {
    const onCancel = vi.fn();
    render(<ConfirmationDialog
      open
      title="Transfer ownership?"
      description="You will become an admin."
      confirmLabel="Transfer ownership"
      onCancel={onCancel}
      onConfirm={vi.fn()}
    />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("prevents cancellation while a destructive action is pending", () => {
    const onCancel = vi.fn();
    render(<ConfirmationDialog
      open
      pending
      title="Remove member?"
      description="This cannot be undone."
      confirmLabel="Remove member"
      onCancel={onCancel}
      onConfirm={vi.fn()}
    />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });
});
