import { expect, test, type Page } from "@playwright/test";

const glyphs = ["🌙", "🧸", "💡", "🍓", "🚀", "🧑🏽‍🚀", "🌙"];
const board = {
  schemaVersion: 1, title: "", intent: "", interpretation: "", edges: [],
  nodes: glyphs.map((glyph, index) => ({ id: `symbol-${index}`, emojiId: `emoji-${index}`, glyph, label: `Symbol ${index}`, meaning: `Idea ${index}`, note: "", role: "subject", x: 20 + index * 8, y: 40, scale: 1, rotation: 0 })),
};
const text = "“Érase una vez una luna curiosa.”\n\nA bear followed its light, carrying a small idea into a very large world.";

for(const locale of ["en","es"] as const)test(`${locale}: localized output title wins over a scene title in another language in the result, shelf and reader`,async({page})=>{
  const title=locale==="es"?"Una celebración de regalos y alegría":"A Festive Gathering of Gifts and Joy";
  const sourceTitle=locale==="es"?"A Festive Gathering of Gifts and Joy":"Una celebración de regalos y alegría";
  const prose=locale==="es"?"Los regalos y los globos sugieren una celebración llena de alegría.":"The gifts and balloons suggest a celebration full of joy.";
  await page.route("**/api/generations",route=>route.fulfill({json:route.request().method()==="GET"?{configured:true,models:["test/text"]}:{result:{title,text:prose,model:"test/text",provider:"openrouter"}}}));
  await page.goto("/");if(locale==="es")await page.getByLabel("Interface language").selectOption("es");
  await page.getByRole("button",{name:locale==="es"?"Espacio creativo":"Playground",exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"scene.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...board,title:sourceTitle}))});
  const submission=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");
  await page.getByRole("button",{name:locale==="es"?"Generar":"Generate",exact:true}).click();
  expect((await submission).postDataJSON()).toMatchObject({settings:{locale},board:{title:sourceTitle}});
  await expect(page.locator(".pg-output .pg-story-title")).toHaveText(title);await expect(page.locator(".pg-output .pg-story-title")).toHaveAttribute("lang",locale);
  await expect(page.locator(".pg-output .pg-story-prose")).toHaveText(prose);await expect(page.locator(".pg-history-title").first()).toHaveText(title);
  await page.getByRole("button",{name:locale==="es"?"Abrir vista de lectura":"Open reading view",exact:true}).click();
  const reader=page.getByRole("dialog",{name:title,exact:true});await expect(reader.locator(".pg-story-title")).toHaveText(title);await expect(reader.locator(".pg-story-prose")).toHaveText(prose);
  await page.keyboard.press("Escape");await expect(page.getByText(locale==="es"?"Guardado en este dispositivo":"Saved on this device",{exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:locale==="es"?"Espacio creativo":"Playground",exact:true}).click();
  await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.locator(".pg-history-title").first()).toHaveText(title);await page.locator(".pg-history-read").first().click();await expect(reader.locator(".pg-story-title")).toHaveText(title);await expect(reader.locator(".pg-story-prose")).toHaveText(prose);
});

async function open(page: Page) {
  // The reading fonts must work even when third-party font services are unavailable.
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.route("**/api/generations", route => route.request().method() === "GET"
    ? route.fulfill({ json: { configured: true, models: ["test/text"], maxOutputTokens: 8192 } })
    : route.fulfill({ json: { result: { title: "The Moon’s Invitation", text, model: "test/text", provider: "openrouter" } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "scene.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(board)) });
  await expect(page.locator(".pg-node")).toHaveCount(glyphs.length);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.locator(".pg-output .pg-story-prose")).toHaveText(text);
}

test("the result motif retains its saved canvas symbols through board changes, reader and reload", async ({ page }) => {
  await open(page);
  const motif = page.locator(".pg-output .pg-story-symbol-motif");
  await expect(motif.locator(".pg-vector-glyph")).toHaveText(glyphs.slice(0, 5));
  await expect(motif).toContainText("+1");
  const changed = { ...board, nodes: [{ ...board.nodes[0], glyph: "🐙", label: "Octopus" }] };
  await page.locator('input[type="file"]').setInputFiles({ name: "new-scene.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changed)) });
  await expect(page.locator(".pg-node")).toHaveCount(1);
  await expect(motif.locator(".pg-vector-glyph")).toHaveText(glyphs.slice(0, 5));
  await expect(page.getByText("This creation uses an earlier version of your ideas.")).toBeVisible();
  await page.getByRole("button", { name: "Open reading view", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "The Moon’s Invitation", exact: true });
  await expect(reader.locator(".pg-story-symbol-motif .pg-vector-glyph")).toHaveText(glyphs.slice(0, 5));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open reading view", exact: true })).toBeFocused();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.reload();await page.getByRole("button", { name: "Playground", exact: true }).click();
  await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);
  await page.locator(".pg-history-read").click();await expect(page.locator(".pg-reader .pg-story-symbol-motif .pg-vector-glyph")).toHaveText(glyphs.slice(0, 5));
});

test("local typography, decorative opening letter and reader remain usable at narrow widths", async ({ page }) => {
  await open(page);
  const prose = page.locator(".pg-output .pg-story-prose");
  const fonts = await prose.evaluate(async el => {
    const heading = document.querySelector(".pg-output .pg-story-title")!;
    const styles = getComputedStyle(el), title = getComputedStyle(heading);
    const bodyFaces = await document.fonts.load(`18px ${styles.fontFamily}`, "Érase");
    const titleFaces = await document.fonts.load(`500 38px ${title.fontFamily}`, "Invitation");
    return { body: bodyFaces.map(f => f.status), title: titleFaces.map(f => f.status), firstLetterSize: parseFloat(getComputedStyle(el, "::first-letter").fontSize), bodySize: parseFloat(styles.fontSize), titleStyle: title.fontStyle };
  });
  expect(fonts.body).toContain("loaded");expect(fonts.title).toContain("loaded");
  expect(fonts.firstLetterSize).toBeGreaterThan(fonts.bodySize * 2);expect(fonts.titleStyle).toBe("normal");
  await expect(prose).toHaveText(text);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Open reading view", exact: true }).click();
    const reader = page.getByRole("dialog", { name: "The Moon’s Invitation", exact: true });
    await expect(reader.locator(".pg-story-prose")).toHaveText(text);
    expect(await reader.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await reader.getByRole("button", { name: "Edit output", exact: true }).click();
    await reader.getByLabel("Edit output", { exact: true }).fill("A new opening, still easy to edit.");
    await reader.getByRole("button", { name: "Done editing", exact: true }).click();
    await expect(reader.locator(".pg-story-prose")).toHaveText("A new opening, still easy to edit.");
    await page.keyboard.press("Escape");
    await page.locator(".pg-output").getByRole("button", { name: "Edit output", exact: true }).click();
    await page.locator(".pg-output").getByLabel("Edit output", { exact: true }).fill(text);
    await page.locator(".pg-output").getByRole("button", { name: "Done editing", exact: true }).click();
  }
});

test("reader opening animation respects both the UI preference and system reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });await open(page);
  const trigger = page.getByRole("button", { name: "Open reading view", exact: true });
  const reader = page.getByRole("dialog", { name: "The Moon’s Invitation", exact: true });
  await trigger.click();await expect(reader).toHaveCSS("animation-name", "pg-reader-arrive");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reduce motion", exact: true }).click();
  await trigger.click();await expect(reader).toHaveCSS("animation-name", "none");
  expect(await reader.evaluate(el => getComputedStyle(el, "::backdrop").animationName)).toBe("none");
  await page.keyboard.press("Escape");await page.getByRole("button", { name: "Reduce motion", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();await expect(reader).toHaveCSS("animation-name", "none");
  await reader.getByRole("button", { name: "Close reading view", exact: true }).click();await expect(trigger).toBeFocused();
});
