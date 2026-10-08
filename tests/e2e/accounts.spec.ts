import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
const password='account-browser-password-123';
const phrase='small symbols infinite possibilities';
test.beforeEach(()=>{const db=new Database(process.env.ACCOUNT_DB_PATH!);db.exec('DELETE FROM app_limits; DELETE FROM rateLimit;');db.close();});
async function create(api:APIRequestContext,origin:string,name='Test explorer'){const username=`person_${randomUUID().slice(0,8)}`;const response=await api.post('/api/account/register',{headers:{origin},data:{username,name,password}});expect(response.ok(),await response.text()).toBe(true);const activated=await api.post('/api/account/activate',{headers:{origin},data:{phrase,emojiId:'1F419'}});expect(activated.ok(),await activated.text()).toBe(true);return username;}
async function addHeart(page:Page){await page.getByRole('button',{name:'Playground',exact:true}).click();await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();await page.getByLabel('Search emojis in English or Spanish').fill('red heart');await page.getByRole('button',{name:'Add red heart',exact:true}).click();await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();}
async function login(page:Page,username:string){await page.goto('/login');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();}

test('anonymous visitors cannot bypass login through any application API',async({page})=>{
  await page.goto('/');await expect(page).toHaveURL(/\/login$/);
  for(const url of ['/api/account/state','/api/account/creations?collection=saved','/api/generations','/api/resolve?emojiId=2764&locale=en','/api/related?title=Love&locale=en'])expect((await page.request.get(url)).status()).toBe(401);
  expect((await page.request.post('/api/discover',{headers:{origin:new URL(page.url()).origin},data:{}})).status()).toBe(401);
  for(const path of ['sign-up/email','sign-in/email','reset-password','link-social','update-user'])expect((await page.request.post(`/api/auth/${path}`,{data:{}})).status()).toBe(404);
});

test('registration, persistent waiting room and bilingual invitation entry are accessible',async({page})=>{
  await page.goto('/login');await page.getByRole('button',{name:'Create an account',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(`Explorer_${randomUUID().slice(0,8)}`);await page.getByLabel('Display name',{exact:true}).fill('Test explorer');await page.getByLabel('Password',{exact:true}).fill(password);
  expect((await new AxeBuilder({page}).exclude('nextjs-portal').analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/\/waiting-room$/);await page.reload();await expect(page.getByRole('heading',{name:'Your invitation',exact:true})).toBeVisible();
  await page.getByLabel('Invitation phrase',{exact:true}).fill('wrong');await page.getByLabel('Search emojis',{exact:true}).fill('octopus');await page.getByRole('button',{name:'octopus',exact:true}).click();await page.getByRole('button',{name:'Enter',exact:true}).click();await expect(page.locator('.account-error')).toContainText('do not match');
  await page.getByLabel('Interface language').selectOption('es');await expect(page.getByRole('heading',{name:'Tu invitación',exact:true})).toBeVisible();await page.getByLabel('Frase de invitación',{exact:true}).fill(' SMALL   SYMBOLS infinite possibilities ');
  expect((await new AxeBuilder({page}).exclude('nextjs-portal').analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('.sidebar')).toBeVisible();
});

test('preferences and both creation collections survive logout and another browser; refresh starts blank',async({page,browser,baseURL})=>{
  const username=await create(page.request,baseURL!);await page.goto('/');await addHeart(page);await page.getByRole('button',{name:'Keep in session',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(1);await page.locator('.cr-save').click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');
  await page.getByLabel('Themes',{exact:true}).selectOption('retro');await expect(page.locator('.preferences .account-save-status')).toHaveText('Preferences saved');
  const state=await (await page.request.get('/api/account/state')).json();const discovery={emojiId:'2764',topic:{label:'Love',query:'Love',englishQuery:'Love',language:'en',wikiTitle:'Love'},at:Date.now()};expect((await page.request.put('/api/account/state',{headers:{origin:baseURL!},data:{...state,preferences:{...state.preferences,favorites:[discovery],history:[discovery]}}})).ok()).toBe(true);
  await page.getByRole('button',{name:/Sign out$/}).click();await expect(page).toHaveURL(/\/login$/);expect((await page.request.get('/api/account/state')).status()).toBe(401);
  const context=await browser.newContext();try{const other=await context.newPage();await login(other,username.toUpperCase());await expect(other.locator('html')).toHaveAttribute('data-theme','retro');await other.getByRole('button',{name:/^Favorites/}).click();await expect(other.locator('.saved-card')).toHaveCount(1);await other.getByRole('button',{name:/^History/}).click();await expect(other.locator('.saved-card')).toHaveCount(1);
    await other.getByRole('button',{name:'Playground',exact:true}).click();await expect(other.locator('.pg-node')).toHaveCount(0);await expect(other.locator('.cr-checkpoint')).toHaveCount(1);await other.getByRole('button',{name:/^Creations/}).click();await expect(other.locator('.cr-tree-canvas')).toHaveCount(1);await other.locator('.cr-library-detail').getByRole('button',{name:'Restore state',exact:true}).click();await expect(other.locator('.pg-node')).toHaveCount(1);await other.reload();await other.getByRole('button',{name:'Playground',exact:true}).click();await expect(other.locator('.pg-node')).toHaveCount(0);await expect(other.locator('.cr-checkpoint')).toHaveCount(1);
  }finally{await context.close();}
});

test('fresh accounts ignore legacy browser records and cannot access another account data',async({page,browser,baseURL})=>{
  await create(page.request,baseURL!);await page.goto('/');await addHeart(page);await page.locator('.cr-save').click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');const firstRecord=(await (await page.request.get('/api/account/creations?collection=saved')).json())[0];
  const context=await browser.newContext();try{const other=await context.newPage();await create(other.request,baseURL!);await other.addInitScript(()=>{localStorage.setItem('dream-maker-v1',JSON.stringify({theme:'retro',locale:'es',favorites:[{emojiId:'2764'}]}));const request=indexedDB.open('dream-maker-playground-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>{const db=request.result,transaction=db.transaction('workspace','readwrite');transaction.objectStore('workspace').put({legacy:true},'active');transaction.oncomplete=()=>db.close();};});await other.goto('/');await expect(other.locator('html')).toHaveAttribute('data-theme','classic');expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('dream-maker-v1')!).theme)).toBe('retro');
    expect(await (await other.request.get('/api/account/creations?collection=saved')).json()).toEqual([]);expect((await other.request.delete('/api/account/creations',{headers:{origin:baseURL!},data:{collection:'saved',records:[firstRecord]}})).status()).toBe(409);expect((await (await page.request.get('/api/account/creations?collection=saved')).json()).length).toBe(1);
  }finally{await context.close();}
});

test('stale preferences preserve the draft and offer explicit reapply or load latest',async({page,baseURL})=>{
  await create(page.request,baseURL!);await page.goto('/');let inject=true;
  await page.route('**/api/account/state',async route=>{if(route.request().method()==='PUT'&&inject){inject=false;const incoming=route.request().postDataJSON();const response=await page.request.put('/api/account/state',{headers:{origin:baseURL!},data:{...incoming,preferences:{...incoming.preferences,theme:'retro'}}});expect(response.ok()).toBe(true);}await route.continue();});
  await page.getByLabel('Themes',{exact:true}).selectOption('cyberpunk');await expect(page.locator('.account-save-status')).toContainText('changed in another tab');await expect(page.locator('html')).toHaveAttribute('data-theme','cyberpunk');await page.getByRole('button',{name:'Reapply my changes',exact:true}).click();await expect(page.locator('.preferences .account-save-status')).toHaveText('Preferences saved');expect((await (await page.request.get('/api/account/state')).json()).preferences.theme).toBe('cyberpunk');
  inject=true;await page.getByLabel('Themes',{exact:true}).selectOption('solarpunk');await expect(page.locator('.account-save-status')).toContainText('changed in another tab');await page.getByRole('button',{name:'Load latest',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','retro');await expect(page.locator('.preferences .account-save-status')).toHaveText('Preferences saved');
});

test('failed creation saves block replacement and logout protects unsaved work',async({page,baseURL})=>{
  await create(page.request,baseURL!);await page.goto('/');await addHeart(page);let fail=true;await page.route('**/api/account/creations',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{code:'storage'}}):route.continue());
  await page.getByRole('button',{name:'New canvas',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Keep your current creation?',exact:true});await dialog.getByRole('button',{name:'Save and continue',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Could not save');await expect(page.locator('.pg-node')).toHaveCount(1);await dialog.locator('.cr-dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:/Sign out$/}).click();await expect(dialog).toBeVisible();await dialog.locator('.cr-dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(1);
  fail=false;await page.locator('.cr-save').click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');await page.getByRole('button',{name:/Sign out$/}).click();await expect(page).toHaveURL(/\/login$/);
});

test('expired sessions preserve the visible editor and cannot write into a different account',async({page,browser,baseURL})=>{
  await create(page.request,baseURL!);await page.goto('/');await addHeart(page);const context=await browser.newContext();try{const other=await context.newPage();await create(other.request,baseURL!);const cookie=(await context.storageState()).cookies;await page.context().clearCookies();await page.context().addCookies(cookie);
    await page.getByLabel('Themes',{exact:true}).selectOption('retro');await expect(page.getByRole('dialog',{name:'Session interrupted',exact:true})).toBeVisible();await expect(page.locator('.pg-node')).toHaveCount(1);expect((await (await other.request.get('/api/account/state')).json()).preferences.theme).toBe('classic');
  }finally{await context.close();}
});


test('fresh Playground defaults preserve a preferred output language separate from the interface',async({page,baseURL})=>{
  await create(page.request,baseURL!);const state=await (await page.request.get('/api/account/state')).json();
  expect((await page.request.put('/api/account/state',{headers:{origin:baseURL!},data:{...state,preferences:{...state.preferences,locale:'es'},playground:{kind:'poem',locale:'en',model:'test/text',reasoningEffort:'high',tone:'gentle'}}})).ok()).toBe(true);
  await page.route('**/api/generations',route=>route.fulfill({json:{configured:true,models:['test/text'],maxOutputTokens:800}}));
  await page.goto('/');await page.getByRole('button',{name:'Espacio creativo',exact:true}).click();await expect(page.locator('.pg-format select')).toHaveValue('poem');
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();const selects=page.locator('#pg-generation-settings select');await expect(selects.nth(0)).toHaveValue('en');await expect(selects.nth(1)).toHaveValue('test/text');await expect(selects.nth(2)).toHaveValue('high');
  await page.getByLabel('Idioma de la interfaz',{exact:true}).selectOption('en');await expect(selects.nth(0)).toHaveValue('en');
  await page.getByRole('button',{name:'New canvas',exact:true}).click();await expect(selects.nth(0)).toHaveValue('en');await expect(page.locator('.pg-format select')).toHaveValue('poem');
});


test('a personal greeting uses the display name beneath the brand and fits every theme and screen size',async({page,baseURL})=>{
  const name='Luna Starlight';await create(page.request,baseURL!,name);await page.goto('/');
  const greeting=page.locator('.sidebar-greeting');await expect(greeting.locator('strong')).toHaveText(name+',');await expect(greeting.locator('em')).toHaveText('imagine');await expect(greeting).toContainText('what will you imagine today?');
  for(const theme of ['classic','cyberpunk','solarpunk','retro']){
    await page.getByLabel('Themes',{exact:true}).selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    for(const width of [1440,820,390,320]){await page.setViewportSize({width,height:1000});await expect(greeting).toBeVisible();const brand=await page.locator('.brand').boundingBox(),box=await greeting.boundingBox();expect(box!.y).toBeGreaterThanOrEqual(brand!.y+brand!.height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    await page.setViewportSize({width:1440,height:1000});
  }
  await page.getByLabel('Interface language',{exact:true}).selectOption('es');await expect(greeting).toContainText('Hola');await expect(greeting.locator('em')).toHaveText('imaginar');await expect(greeting.locator('strong')).toHaveText(name+',');
  await page.getByLabel('Idioma de la interfaz',{exact:true}).selectOption('en');await page.getByLabel('Themes',{exact:true}).selectOption('classic');await expect(page.locator('html')).toHaveAttribute('data-theme','classic');await page.waitForTimeout(250);await page.screenshot({path:'/tmp/emoji-greeting-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/emoji-greeting-phone.png'});
});
