import { expect, test } from "@playwright/test";

test("demo dashboard and club creation remain navigable", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lena");

  await page.getByRole("link", { name: /new club/i }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Create a club" })).toBeVisible();
  await expect(page.getByLabel("Visibility")).toHaveValue("private");

  await page.getByLabel("Club name").fill("Browser Listening Club");
  await page.getByRole("textbox", { name: "Description" }).fill("A real browser exercise for the creation journey.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /set the ritual/i })).toBeVisible();
});

test("unsaved club details block client-side navigation", async ({ page }) => {
  await page.goto("/app/clubs/new");
  await page.getByLabel("Club name").fill("Do not lose me");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Discover" }).first().click();
  await expect(page).toHaveURL(/\/app\/clubs\/new$/);
});

test("private invitation secrets are exchanged from the URL fragment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "The same server-side exchange is covered once on desktop.");
  const invitationResponse = await page.request.post("/api/clubs/sunday-service/invitation");
  expect(invitationResponse.ok()).toBe(true);
  const invitation = await invitationResponse.json() as { token: string };

  await page.goto(`/app/clubs/sunday-service/invite#${encodeURIComponent(invitation.token)}`);

  await expect(page).toHaveURL(/\/app\/clubs\/sunday-service$/);
  expect(page.url()).not.toContain(invitation.token);
  expect(page.url()).not.toContain("invite=");
  const sessionCookie = (await page.context().cookies())
    .find((cookie) => cookie.name === "dropday_invitation_session");
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
});
