import { describe, expect, it } from "vitest";
import { hasSameMembers, moveMember, nextActiveMember, preserveTurn, rotateQueue } from "@/lib/queue";

describe("club rotation", () => {
  it("moves a completed assignee to the end", () => {
    expect(rotateQueue(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });

  it("preserves a missed assignee at the front when an admin chooses", () => {
    expect(preserveTurn(["b", "a", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("finds the next active member without changing the queue order", () => {
    const queue = ["a", "b", "c"];
    expect(nextActiveMember(queue, ["a", "b"])).toBe("c");
    expect(nextActiveMember(queue, ["a", "b", "c"])).toBeUndefined();
    expect(queue).toEqual(["a", "b", "c"]);
  });

  it("moves a member to another member's position", () => {
    expect(moveMember(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveMember(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("only accepts complete, duplicate-free member orders", () => {
    expect(hasSameMembers(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(hasSameMembers(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(hasSameMembers(["a", "b", "c"], ["a", "b", "b"])).toBe(false);
    expect(hasSameMembers(["a", "b", "c"], ["a", "b", "d"])).toBe(false);
  });
});
