import { describe, expect, it } from "vitest";
import { GET } from "@/app/llms.txt/route";
import { buildLlmsText } from "@/lib/llms";

describe("LLM site context", () => {
  it("uses the configured site origin for public product links", () => {
    const text = buildLlmsText("https://dropday.example/deployment");

    expect(text).toContain("[Dropday home](https://dropday.example/)");
    expect(text).toContain("[Pricing](https://dropday.example/pricing)");
    expect(text).toContain("[Create a Dropday account](https://dropday.example/sign-up)");
  });

  it("distinguishes Dropday from a streaming service and protects private context", () => {
    const text = buildLlmsText("https://dropday.example");

    expect(text).toContain("it is not a music streaming service");
    expect(text).toContain("Private club content and member conversations require access");
    expect(text).not.toContain("/app/");
  });

  it("serves the conventional route as cacheable plain text", async () => {
    const response = GET();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400");
    expect(await response.text()).toMatch(/^# Dropday\n/);
  });
});
