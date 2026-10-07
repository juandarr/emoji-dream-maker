import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const themes = ["classic", "cyberpunk", "solarpunk", "retro"] as const;
const board = {
  schemaVersion: 1, title: "A new beginning", intent: "Hope", interpretation: "Hope by the sea", edges: [],
  nodes: [
    { id: "sun", emojiId: "2600", glyph: "☀️", label: "Sun", meaning: "Sun", note: "", role: "subject", x: 30, y: 40, scale: 1, rotation: 0 },
    { id: "sea", emojiId: "1F30A", glyph: "🌊", label: "Ocean", meaning: "Ocean", note: "", role: "setting", x: 65, y: 55, scale: 1, rotation: 0 },
  ],
};

async function fixtures(page: Page) {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.route("https://api.giphy.com/**", route => route.fulfill({ json: { data: [] } }));
  await page.route("https://www.youtube.com/iframe_api", route => route.abort());
  await page.route("**/api/related?**", route => route.fulfill({ json: { status: "ready", topics: [] } }));
  await page.route("**/api/resolve?**", route => route.fulfill({ json: { defaultTopic: { label: "Octopus", query: "Octopus", englishQuery: "Octopus", language: "en", wikiTitle: "Octopus" }, alternatives: [] } }));
  await page.route("**/api/discover", route => route.fulfill({ json: { status: "unavailable", reason: "credentials", items: [] } }));
  await page.route("**/api/generations", route => route.fulfill({ json: route.request().method() === "GET"
    ? { configured: true, models: ["test/text"] }
    : { result: { title: "A new beginning", text: "At the edge of the sea, a small boat waited for morning. The sunlight found its way across the water.", model: "test/text", provider: "openrouter" } } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByLabel("Themes", { exact: true })).toBeEnabled();
}

test("themes are labeled, placed below language, localized, and saved without losing other preferences", async ({ page }) => {
  await fixtures(page);
  const picker = page.getByLabel("Themes", { exact: true });
  await expect(picker).toHaveValue("classic");
  await expect(picker.locator("option")).toHaveText(["Classic", "Cyberpunk", "Solarpunk", "Retro"]);
  const languageBox = await page.locator(".language-picker").boundingBox();
  const themeBox = await page.locator(".theme-picker").boundingBox();
  expect(themeBox!.y).toBeGreaterThanOrEqual(languageBox!.y + languageBox!.height);
  await page.getByLabel("Interface language").selectOption("es");
  await expect(page.getByLabel("Temas", { exact: true }).locator("option").first()).toHaveText("Clasico");
  await page.getByLabel("Temas", { exact: true }).selectOption("solarpunk");
  await page.getByRole("button", { name: "Cuadrícula", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Temas", { exact: true })).toHaveValue("solarpunk");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "solarpunk");
  await expect(page.locator(".dream-canvas")).toHaveClass(/grid/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dream-maker-v1")!))).toMatchObject({ locale: "es", theme: "solarpunk", view: "grid" });
});

test("saved themes apply before hydration and invalid stored themes fall back to Classic", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dream-maker-v1", JSON.stringify({ theme: "retro" })));
  await page.route(/\/_next\/.*\.js(?:\?|$)/, route => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "retro");
  await page.addInitScript(() => localStorage.setItem("dream-maker-v1", JSON.stringify({ theme: "invalid" })));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classic");
});

test("every emoji follows its visible orbit and stays upright, including animated Solarpunk ellipses", async ({ page }) => {
  await fixtures(page);
  for (const theme of themes) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const time of [0, 17300, 51000]) {
      const errors = await page.evaluate(time => {
        const canvas = document.querySelector<HTMLElement>(".dream-canvas")!;
        // Advance both revolutions deterministically, retaining the real CSS transforms.
        for (const animation of canvas.getAnimations({ subtree: true })) {
          if (animation instanceof CSSAnimation && animation.animationName.startsWith("emoji-")) { animation.pause(); animation.currentTime = time; }
        }
        const box = canvas.getBoundingClientRect();
        const canvasStyle = getComputedStyle(canvas);
        // clientWidth/clientHeight round fractional CSS pixels to integers.
        const width = box.width - parseFloat(canvasStyle.borderLeftWidth) - parseFloat(canvasStyle.borderRightWidth);
        const height = box.height - parseFloat(canvasStyle.borderTopWidth) - parseFloat(canvasStyle.borderBottomWidth);
        const centerX = box.left + parseFloat(canvasStyle.borderLeftWidth) + width / 2;
        const centerY = box.top + parseFloat(canvasStyle.borderTopWidth) + height / 2;
        const rootStyle = getComputedStyle(document.documentElement);
        const angle = parseFloat(rootStyle.getPropertyValue("--orbit-rotation")) * Math.PI / 180 || 0;
        const sx = parseFloat(rootStyle.getPropertyValue("--orbit-scale-x")) || 1;
        const sy = parseFloat(rootStyle.getPropertyValue("--orbit-scale-y")) || 1;
        return [...canvas.querySelectorAll<HTMLElement>(".emoji-orbit")].map(orbit => {
          const button = orbit.querySelector<HTMLElement>(".emoji-button")!;
          const bounds = button.getBoundingClientRect();
          const dx = (bounds.left + bounds.width / 2 - centerX) / width * 100;
          const dy = (bounds.top + bounds.height / 2 - centerY) / height * 100;
          const x = (Math.cos(angle) * dx + Math.sin(angle) * dy) / sx;
          const y = (-Math.sin(angle) * dx + Math.cos(angle) * dy) / sy;
          const matrix = [canvas.querySelector(".emoji-field")!, orbit, orbit.querySelector(".emoji-orbit-position")!, button].reduce((m, n) => m.multiply(new DOMMatrix(getComputedStyle(n).transform)), new DOMMatrix());
          return { radiusError: Math.abs(Math.hypot(x, y) - parseFloat(orbit.style.getPropertyValue("--radius"))), orientationError: Math.max(Math.abs(matrix.a - 1), Math.abs(matrix.b), Math.abs(matrix.c), Math.abs(matrix.d - 1)) };
        });
      }, time);
      expect(Math.max(...errors.map(e => e.radiusError)), `${theme}, time ${time}`).toBeLessThan(.05);
      expect(Math.max(...errors.map(e => e.orientationError)), `${theme}, time ${time}`).toBeLessThan(.001);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
});

test("new palettes preserve accessible text contrast in discovery and playground", async ({ page }) => {
  await fixtures(page);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  for (const theme of themes.slice(1)) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    for (const screen of ["Discover", "Playground"]) {
      await page.getByRole("button", { name: screen, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude("nextjs-portal").analyze();
      expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), `${theme}, ${screen}`).toEqual([]);
    }
  }
});

test("theme changes preserve black hole geometry, reading typography and history grid layout", async ({ page }) => {
  await fixtures(page);
  const geometry = () => page.locator(".black-hole").evaluate(svg => [...svg.querySelectorAll("path,circle,ellipse")].map(n => Object.fromEntries(["d", "cx", "cy", "r", "rx", "ry"].map(a => [a, n.getAttribute(a)]))));
  const originalGeometry = await geometry();
  for (const theme of themes) { await page.getByLabel("Themes", { exact: true }).selectOption(theme); expect(await geometry()).toEqual(originalGeometry); }
  await page.getByLabel("Themes", { exact: true }).selectOption("classic");
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(board)) });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.locator(".pg-output .pg-story-prose")).toContainText("At the edge of the sea");
  await page.evaluate(() => document.fonts.ready);
  const styles = () => page.evaluate(() => Object.fromEntries([".pg-output .pg-story-page", ".pg-output .pg-story-title", ".pg-output .pg-story-prose", ".pg-output .pg-story-actions button", ".pg-results .pg-result-list", ".pg-results .pg-history-card", ".pg-results .pg-history-title", ".pg-results .pg-history-footer"].map(selector => {
    const style = getComputedStyle(document.querySelector(selector)!);
    return [selector, Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "lineHeight", "padding", "margin", "display", "gridTemplateColumns", "gap"].map(property => [property, style.getPropertyValue(property.replace(/[A-Z]/g, c => "-" + c.toLowerCase()))]))];
  })));
  const originalStyles = await styles();
  for (const theme of themes) { await page.getByLabel("Themes", { exact: true }).selectOption(theme); expect(await styles()).toEqual(originalStyles); }
  await page.getByRole("button", { name: "Open reading view", exact: true }).click();
  await expect(page.locator(".pg-reader .pg-story-prose")).toContainText("At the edge of the sea");
  await expect(page.locator(".pg-reader .pg-story-page")).toHaveCSS("border-radius", "14px");
});

test("custom orbits still support dragging an emoji into the original portal", async ({ page }) => {
  await fixtures(page);
  await page.getByLabel("Themes", { exact: true }).selectOption("solarpunk");
  await page.getByRole("textbox", { name: /Search a word/ }).fill("octopus");
  const emoji = page.getByLabel("octopus", { exact: true });
  await expect(page.locator(".emoji-button")).toHaveCount(1);
  await emoji.scrollIntoViewIfNeeded();
  const start = await emoji.boundingBox(), target = await page.locator(".portal").boundingBox();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down(); await page.mouse.move(start!.x + start!.width / 2 + 10, start!.y + start!.height / 2, { steps: 3 });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 20 }); await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Octopus", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("theme controls and content fit desktop, tablet and phone widths", async ({ page }) => {
  await fixtures(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of themes) {
      await page.getByLabel("Themes", { exact: true }).selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByLabel("Themes", { exact: true })).toBeVisible();
      const box = await page.getByLabel("Themes", { exact: true }).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
});

test("switch states remain distinct and canvas borders meet continuously in every theme", async ({ page }) => {
  await fixtures(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const theme of themes) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    const motion = page.locator(".motion-toggle");
    const switchColors = (selector: string, pseudo: string) => page.locator(selector).evaluate((el, pseudo) => ({ track: getComputedStyle(el).backgroundColor, knob: getComputedStyle(el, pseudo).backgroundColor, left: getComputedStyle(el, pseudo).left }), pseudo);
    const off = await switchColors(".toggle", "::after");
    expect(off.knob).not.toBe(off.track);
    await motion.click();
    const on = await switchColors(".toggle", "::after");
    expect(on.knob).not.toBe(on.track);
    expect(on.left).not.toBe(off.left);
    expect(on.track).not.toBe(off.track);
    await motion.click();
    await page.getByRole("button", { name: "Playground", exact: true }).click();
    await page.getByRole("button", { name: "Context", exact: true }).click();
    const relation = page.getByRole("button", { name: "Add relationships", exact: true });
    const relationOff = await switchColors(".pg-toggle-switch", "::before");
    expect(relationOff.knob).not.toBe(relationOff.track);
    await relation.click();
    const relationOn = await switchColors(".pg-toggle-switch", "::before");
    expect(relationOn.knob).not.toBe(relationOn.track);
    expect(relationOn.left).not.toBe(relationOff.left);
    expect(relationOn.track).not.toBe(relationOff.track);
    await relation.click();
    await page.getByRole("button", { name: "Context", exact: true }).click();
    const borders = await page.evaluate(() => {
      const outer = getComputedStyle(document.querySelector(".pg-stage")!), toolbar = getComputedStyle(document.querySelector(".pg-space-toolbar")!), board = getComputedStyle(document.querySelector(".pg-board")!);
      return { outerRadius: parseFloat(outer.borderTopLeftRadius), outerWidth: parseFloat(outer.borderLeftWidth), topRadius: parseFloat(toolbar.borderTopLeftRadius), bottomRadius: parseFloat(board.borderBottomLeftRadius), boardBorder: parseFloat(board.borderLeftWidth) };
    });
    expect(borders.boardBorder).toBe(0);
    expect(borders.topRadius).toBe(borders.bottomRadius);
    expect(Math.abs(borders.outerRadius - borders.outerWidth - borders.topRadius)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Discover", exact: true }).click();
  }
});

test("themed story surfaces and reader remain accessible with long content and contained scrolling", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/generations", route => route.fulfill({ json: route.request().method() === "GET" ? { configured: true, models: ["test/text"] } : { result: { title: "Morning by the sea", text: "Morning light glimmers across the water. ".repeat(140), model: "test/text", provider: "openrouter" } } }));
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(board)) });
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.locator(".pg-history-card")).toHaveCount(1);
  for (const theme of themes) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(page.locator(".motion-toggle")).toBeVisible();
      await expect(page.locator(".pg-output")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(page.locator(".pg-results")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      if (viewport.width === 1440) {
        await page.getByRole("button", { name: "Generate", exact: true }).hover();
        const shelfReport = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude("nextjs-portal").analyze();
        expect(shelfReport.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), `${theme}, shelf and hovered primary action`).toEqual([]);
      }
      await page.locator(".pg-history-read").click();
      const reader = page.locator(".pg-reader");
      await expect(reader).toBeVisible();
      await reader.getByRole("button", { name: "Close reading view", exact: true }).focus();
      await page.keyboard.press("Shift+Tab");
      expect(await reader.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Tab");
      await expect(reader.getByRole("button", { name: "Close reading view", exact: true })).toBeFocused();
      expect(await reader.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
      const scroll = page.locator(".pg-reader-scroll");
      expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      const readerBox = (await reader.boundingBox())!, scrollBox = (await scroll.boundingBox())!;
      expect(scrollBox.x + scrollBox.width).toBeLessThan(readerBox.x + readerBox.width - 5);
      expect(scrollBox.y + scrollBox.height).toBeLessThan(readerBox.y + readerBox.height - 5);
      const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude("nextjs-portal").analyze();
      expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), `${theme}, reader ${viewport.width}`).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator(".pg-history-read")).toBeFocused();
    }
  }
});

test("portal scrollbars stay inside the modal and close controls remain reachable across themes", async ({ page }) => {
  await fixtures(page);
  await page.getByRole("textbox", { name: /Search a word/ }).fill("octopus");
  await page.getByLabel("octopus", { exact: true }).click();
  for (const theme of themes) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    for (const viewport of [{ width: 1440, height: 700 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Open portal", exact: true }).last().click();
      const gallery = page.locator(".gallery"), scroll = page.locator(".gallery-scroll");
      await expect(gallery).toBeVisible();
      await expect(gallery).toHaveCSS("opacity", "1");
      await expect(page.locator(".gallery-backdrop")).toHaveCSS("opacity", "1");
      await expect(page.locator(".wikipedia-section")).toHaveAttribute("aria-busy", "false");
      const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude("nextjs-portal").analyze();
      expect(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), `${theme}, gallery ${viewport.width}`).toEqual([]);
      await expect(gallery).toHaveCSS("overflow", "hidden");
      await expect(scroll).toHaveCSS("overflow", "auto");
      expect(await gallery.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
      await scroll.evaluate(el => el.scrollTop = el.scrollHeight);
      await expect(page.getByRole("button", { name: "Close gallery", exact: true })).toBeInViewport();
      const box = (await gallery.boundingBox())!, inner = (await scroll.boundingBox())!;
      expect(inner.x + inner.width).toBeLessThan(box.x + box.width - 5);
      expect(inner.y + inner.height).toBeLessThan(box.y + box.height - 5);
      await page.getByRole("button", { name: "Close gallery", exact: true }).click();
    }
  }
});

test("canvas artwork retains its size after phone, desktop and fullscreen round trips", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page);
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(board)) });
  const glyphSize = () => page.locator(".pg-node>span").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const initial = await glyphSize();
  for (const theme of themes) {
    await page.getByLabel("Themes", { exact: true }).selectOption(theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(glyphSize).toBeLessThan(initial);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect.poll(glyphSize).toBeCloseTo(initial, 1);
    await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
    await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect.poll(glyphSize).toBeCloseTo(initial, 1);
  }
});
