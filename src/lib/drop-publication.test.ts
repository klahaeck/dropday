import { describe, expect, it } from "vitest";
import { queueAfterPublishedDrop } from "@/lib/drop-publication";

describe("published drop queue effects", () => {
  it("consumes the original assignee's turn after a normal or late publication", () => {
    expect(queueAfterPublishedDrop({
      queue: ["assignee", "next", "last"],
      assignedUserId: "assignee",
      queueEffect: "consumeTurn",
    })).toEqual(["next", "last", "assignee"]);
  });

  it("keeps the missed assignee at the front when an admin preserves the turn", () => {
    expect(queueAfterPublishedDrop({
      queue: ["next", "assignee", "last"],
      assignedUserId: "assignee",
      queueEffect: "preserveTurn",
    })).toEqual(["assignee", "next", "last"]);
  });
});
