import { expect, test, type Locator, type Page } from "@playwright/test";

async function openPlayground(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/generations", route => route.fulfill({
    json: { configured: false, models: ["test/text"], maxOutputTokens: 8192 },
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(page.locator(".pg-board")).toBeVisible();
}

const icons = [
  { label: "Settings information", panel: "#pg-settings-information" },
  { label: "Generation summary", panel: "#pg-generation-summary" },
];

async function appearance(element: Locator) {
  return element.evaluate(el => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color, radius: style.borderRadius, width: style.width, height: style.height };
  });
}

test("information opens only on hover, stays reachable, and clicks cannot pin it", async ({ page }) => {
  await openPlayground(page);
  for (const { label, panel: selector } of icons) {
    const icon = page.getByRole("button", { name: label, exact: true });
    const panel = page.locator(selector);
    await page.getByLabel("Make a", { exact: true }).hover();
    await icon.focus();
    await expect(panel).toBeHidden();
    await icon.press("Enter");
    await expect(panel).toBeHidden();
    await icon.hover();
    await expect(panel).toBeVisible();
    await panel.hover();
    await expect(panel).toBeVisible();
    await icon.click();
    await page.getByLabel("Make a", { exact: true }).hover();
    await expect(panel).toBeHidden();
    await expect(icon).toBeFocused();
    await icon.hover();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
});

test("both information icons have identical hover styling in every palette and viewport", async ({ page }) => {
  await openPlayground(page);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ["classic", "cyberpunk", "solarpunk", "retro"]) {
      await page.getByLabel("Themes", { exact: true }).selectOption(theme);
      const styles = [];
      for (const { label } of icons) {
        const icon = page.getByRole("button", { name: label, exact: true });
        await icon.hover();
        styles.push(await appearance(icon));
      }
      expect(styles[0], `${theme}, ${viewport.width}`).toEqual(styles[1]);
      expect(styles[0].background).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles[0].radius).toBe("7px");
    }
  }
});

test("touch taps do not leave information popups open", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await openPlayground(page);
    for (const { label, panel } of icons) {
      await page.getByRole("button", { name: label, exact: true }).tap();
      await expect(page.locator(panel)).toBeHidden();
    }
  } finally {
    await context.close();
  }
});
