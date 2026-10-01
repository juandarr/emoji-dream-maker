import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

// Optional saved live API sample avoids repeating museum requests during visual QA.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const samples = process.argv[2] ? JSON.parse(await readFile(process.argv[2], "utf8")) : null;
const subject = process.env.ART_REVIEW_SUBJECT || "Love";
const emojiLabel = subject === "Musical note" ? "musical note" : "red heart";
const outputSuffix = subject === "Love" ? "" : `-${subject.toLowerCase().replaceAll(" ", "-")}`;
const selectedIndex = Number(process.env.ART_REVIEW_INDEX || 0);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await mkdir("docs/art-review", { recursive: true });
if (samples) {
  await page.route("**/api/resolve?**", route => route.fulfill({ json: { defaultTopic: { label: subject, query: subject, englishQuery: subject, language: "en" }, alternatives: [] } }));
  await page.route("**/api/related?**", route => route.fulfill({ json: { status: "empty", topics: [] } }));
  await page.route("**/api/discover", route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: body.provider === "art" ? samples.find(sample => sample.subject === subject).result : { status: "empty", items: [] } });
  });
}
await page.goto(baseURL);
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByRole("textbox", { name: /Search a word/ }).fill(emojiLabel);
await page.getByLabel(emojiLabel, { exact: true }).click();
await page.getByRole("button", { name: "Open portal", exact: true }).first().click();
await page.locator(".artwork-card").first().waitFor();
const cards = page.locator(".artwork-preview");
const images = [];
for (let index = 0; index < await cards.count(); index++) {
  const card = cards.nth(index);await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(index => {
    const image = document.querySelectorAll(".artwork-preview img")[index];
    return image?.complete || document.querySelectorAll(".artwork-preview")[index]?.querySelector(".art-image-error");
  }, index);
  images.push(await card.evaluate(el => ({ title: el.getAttribute("aria-label"), loaded: !!el.querySelector("img")?.naturalWidth })));
}
await page.locator(".art-section").evaluate(el => el.closest(".gallery").scrollTo(0, el.offsetTop - 15));
await page.screenshot({ path: `docs/art-review/gallery-desktop${outputSuffix}.png` });
await cards.nth(selectedIndex).click();
await page.waitForFunction(() => document.querySelector(".image-dialog img")?.complete);
await page.screenshot({ path: `docs/art-review/viewer-desktop${outputSuffix}.png` });
await page.getByRole("button", { name: "Close image", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await cards.first().scrollIntoViewIfNeeded();
await page.screenshot({ path: `docs/art-review/gallery-phone${outputSuffix}.png` });
await cards.nth(selectedIndex).click();
await page.waitForFunction(() => document.querySelector(".image-dialog img")?.complete);
await page.screenshot({ path: `docs/art-review/viewer-phone${outputSuffix}.png` });
console.log(JSON.stringify({ images, viewerTitle: await page.locator(".image-dialog h2").textContent(), viewerLoaded: await page.locator(".image-dialog img").evaluate(el => !!el.naturalWidth), overflow: await page.locator(".image-dialog").evaluate(el => el.scrollWidth > el.clientWidth) }, null, 2));
await browser.close();
