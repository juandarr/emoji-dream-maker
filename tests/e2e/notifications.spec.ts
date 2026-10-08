import { setAccountPreferences } from "./helpers/account";
import { test, expect } from "./helpers/account";
import { type Page } from "@playwright/test";

async function clock(page:Page) {
  await page.clock.install({time:new Date('2026-10-08T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'));
}
async function playground(page:Page) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/api/generations',route=>route.fulfill({json:{configured:true,models:['test/text']}}));
  await page.goto('/');await page.getByRole('button',{name:'Playground',exact:true}).click();
  await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();
  await page.getByLabel('Search emojis in English or Spanish').fill('red heart');
  await page.getByRole('button',{name:'Add red heart',exact:true}).click();
  await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();
  await clock(page);
}

test('Playground notifications expire after five seconds across navigation and preserve manual close',async({page})=>{
  await playground(page);
  const save=page.locator('.cr-action-buttons').getByRole('button',{name:'Save creation',exact:true});
  const notice=page.locator('.storage-notice');await save.click();await expect(notice).toContainText('Creation saved.');
  await page.clock.runFor(4000);await page.getByRole('button',{name:/^Creations/}).click();await expect(notice).toBeVisible();
  await page.clock.runFor(999);await expect(notice).toBeVisible();await page.clock.runFor(1);await expect(notice).toHaveCount(0);
  await page.getByRole('button',{name:'Playground',exact:true}).click();await save.click();await expect(notice).toBeVisible();await page.clock.runFor(3000);
  await notice.getByRole('button',{name:'Dismiss notice',exact:true}).click();await expect(notice).toHaveCount(0);
  await page.getByRole('button',{name:'Keep in session',exact:true}).click();await expect(notice).toContainText('Kept in temporary history.');
  await page.clock.runFor(2000);await expect(notice).toBeVisible();await page.clock.runFor(3000);await expect(notice).toHaveCount(0);
});

test('identical notifications restart the deadline and deletion Undo banners expire in both collections',async({page})=>{
  await playground(page);const keep=page.getByRole('button',{name:'Keep in session',exact:true});
  await keep.click();await expect(page.locator('.storage-notice')).toContainText('Kept');await page.clock.runFor(4000);
  await keep.click();await expect(keep).toBeEnabled();await page.clock.runFor(4000);await expect(page.locator('.storage-notice')).toContainText('Kept');await page.clock.runFor(1000);await expect(page.locator('.storage-notice')).toHaveCount(0);
  await page.locator('.cr-action-buttons').getByRole('button',{name:'Save creation',exact:true}).click();
  await page.locator('.cr-checkpoint .pg-history-delete').click();await expect(page.locator('.cr-temporary .storage-notice')).toContainText('Removed');await page.clock.runFor(5000);await expect(page.locator('.storage-notice')).toHaveCount(0);
  await expect(page.locator('.pg-node')).toHaveCount(1);await page.getByRole('button',{name:/^Creations/}).click();
  await page.locator('.cr-remove-saved').click();await expect(page.locator('.storage-notice')).toContainText('Removed');await page.clock.runFor(5000);await expect(page.locator('.storage-notice')).toHaveCount(0);
});

test('Discovery Undo notifications expire without restoring cleared favorites or history',async({page})=>{
  const record={emojiId:'2764',topic:{label:'Love',query:'Love',englishQuery:'Love',language:'en',wikiTitle:'Love'},at:Date.now()};
  await setAccountPreferences(page,{locale:'en',theme:'classic',view:'grid',reduced:true,favorites:[record],history:[record]});
  await page.goto('/');await page.getByRole('button',{name:/^Favorites/}).click();await expect(page.locator('.saved-card')).toHaveCount(1);await clock(page);
  for(const tab of ['Favorites','History']) {
    await page.getByRole('button',{name:new RegExp(`^${tab}`)}).click();await page.getByRole('button',{name:'Clear all',exact:true}).click();
    await expect(page.locator('.storage-notice')).toBeVisible();await page.clock.runFor(4999);await expect(page.locator('.storage-notice')).toBeVisible();await page.clock.runFor(1);await expect(page.locator('.storage-notice')).toHaveCount(0);await expect(page.locator('.saved-card')).toHaveCount(0);
  }
});

test('storage error banners expire while the editor remains available',async({page})=>{
  await page.route('**/api/account/creations?**',route=>route.fulfill({status:503,json:{code:'storage'}}));
  await page.route('**/api/generations',route=>route.fulfill({json:{configured:true,models:['test/text']}}));
  await page.goto('/');await clock(page);await page.getByRole('button',{name:'Playground',exact:true}).click();
  await expect(page.locator('.storage-notice')).toContainText('Could not open your creation history');await page.clock.runFor(5000);await expect(page.locator('.storage-notice')).toHaveCount(0);await expect(page.locator('.pg-board')).toBeVisible();
});
