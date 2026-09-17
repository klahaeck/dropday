import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavigationBlockerProvider } from "@/components/navigation-blocker";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";

function DirtyForm({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return <a href="/app/discover" onClick={(event) => event.preventDefault()}>Discover</a>;
}

describe("unsaved-change navigation blocking", () => {
  it("blocks an internal app link when the user declines to discard changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NavigationBlockerProvider><DirtyForm dirty /></NavigationBlockerProvider>);

    expect(fireEvent.click(screen.getByRole("link", { name: "Discover" }))).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("does not prompt when the form is clean", () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<NavigationBlockerProvider><DirtyForm dirty={false} /></NavigationBlockerProvider>);

    fireEvent.click(screen.getByRole("link", { name: "Discover" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("reverses browser history traversal when changes are not discarded", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    render(<NavigationBlockerProvider><DirtyForm dirty /></NavigationBlockerProvider>);

    fireEvent.popState(window);
    expect(go).toHaveBeenCalledWith(1);
  });
});
