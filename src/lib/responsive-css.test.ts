import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const structure = readFileSync("src/app/app-structure.css", "utf8");
const classic = readFileSync("src/app/globals.css", "utf8");
const alternate = readFileSync("src/app/skin-brutal.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const foundations = `${classic}\n${alternate}`;

function ruleBodiesFor(css: string, className: string) {
  const bodies: string[] = [];
  const classToken = new RegExp(`(?:^|[\\s,>+~])\\.${className}(?=[\\s,.#:[>+~]|$)`);

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (classToken.test(match[1])) bodies.push(match[2]);
  }

  return bodies;
}

describe("responsive app CSS ownership", () => {
  it("loads shared application geometry after every visual skin", () => {
    const structureImport = layout.indexOf('import "./app-structure.css"');

    expect(structureImport).toBeGreaterThan(layout.indexOf('import "./skin-brutal.css"'));
    expect(structureImport).toBeGreaterThan(layout.indexOf('import "./skin-rap.css"'));
  });

  it("makes the app main column the inline-size container", () => {
    expect(structure).toMatch(/\.app-main\s*\{[^}]*container-name:\s*app-main;/s);
    expect(structure).toMatch(/\.app-main\s*\{[^}]*container-type:\s*inline-size;/s);
    expect(structure).toContain("@container app-main (max-width: 1000px)");
    expect(structure).toContain("@container app-main (max-width: 720px)");
    expect(structure).toContain("@container app-main (max-width: 560px)");
    expect(structure).toContain("@container app-main (max-width: 430px)");
  });

  it("owns the application tracks in the shared structure file", () => {
    for (const selector of [
      ".dashboard-grid",
      ".club-layout",
      ".drop-detail-grid",
      ".settings-grid",
      ".form-grid",
      ".club-member-row",
      ".drop-attachment-form",
      ".chat-panel",
    ]) {
      expect(structure, `${selector} should be in app-structure.css`).toContain(selector);
    }

    for (const className of [
      "dashboard-grid",
      "club-layout",
      "drop-detail-grid",
      "settings-grid",
      "form-grid",
      "club-member-row",
      "drop-attachment-form",
    ]) {
      const duplicateTracks = ruleBodiesFor(foundations, className)
        .filter((body) => /grid-template-columns\s*:/.test(body));
      expect(duplicateTracks, `${className} tracks should not be skin-owned`).toEqual([]);
    }
  });

  it("keeps dashboard actions and statistics available at narrow widths", () => {
    expect(foundations).not.toMatch(/dashboard-page-actions[^{}]*\{[^}]*display:\s*none/s);
    expect(foundations).not.toMatch(/dashboard-stats-grid[^{}]*\{[^}]*display:\s*none/s);
    expect(structure).toMatch(/@container app-main \(max-width: 560px\)[\s\S]*\.page-actions\s*\{[\s\S]*display:\s*grid/);
    expect(structure).toMatch(/@container app-main \(max-width: 430px\)[\s\S]*\.stats-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it("preserves the viewport-based 800px navigation switch", () => {
    expect(structure).toMatch(/@media \(max-width: 800px\)[\s\S]*\.app-shell\s*\{[\s\S]*display:\s*block/);
    expect(structure).toMatch(/@media \(max-width: 800px\)[\s\S]*:root \.app-shell > \.app-sidebar\s*\{[\s\S]*display:\s*none/);
    expect(structure).toMatch(/@media \(max-width: 800px\)[\s\S]*:root \.app-shell > \.mobile-app-header\s*\{[\s\S]*display:\s*flex/);
  });

  it("uses dynamic viewport height for chat instead of a forced desktop height", () => {
    expect(structure).toMatch(/\.app-main \.chat-panel\s*\{[^}]*100dvh/s);
    expect(foundations).not.toMatch(/\.chat-panel[^{}]*\{[^}]*height:\s*620px/s);
  });

  it("does not leak content geometry onto public page headers", () => {
    expect(structure).not.toMatch(/(^|\n)\.page-header\s*\{/);
    expect(structure).toContain(".app-main .page-header");
  });

  it("keeps visually hidden app controls out of the root scroll area", () => {
    expect(structure).toMatch(/\.app-main \.sr-only\s*\{[^}]*inset:\s*0 auto auto 0;[^}]*clip-path:\s*inset\(50%\);/s);
    expect(structure).toMatch(/\.app-main \.field input\.sr-only\s*\{[^}]*width:\s*1px;[^}]*height:\s*1px;[^}]*padding:\s*0;/s);
  });
});
