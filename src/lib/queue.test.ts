import { describe, expect, it } from "vitest";
import { appendMember, pauseMember, preserveTurn, rotateQueue } from "@/lib/queue";

describe("club rotation", () => {
  it("moves a completed assignee to the end", () => {
    expect(rotateQueue(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });

  it("preserves a missed assignee at the front when an admin chooses", () => {
    expect(preserveTurn(["b", "a", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("pauses and appends without duplicate queue entries", () => {
    expect(pauseMember(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(appendMember(["a", "c"], "b")).toEqual(["a", "c", "b"]);
    expect(appendMember(["a", "b"], "b")).toEqual(["a", "b"]);
  });
});
