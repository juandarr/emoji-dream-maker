import { savedBoard, restoreBoard } from "./helpers/playground-workspace";
import { test, expect } from "./helpers/account";
import {type Page} from "@playwright/test";

const fixture={schemaVersion:1,title:"A small scene",intent:"",interpretation:"",nodes:[
 {id:"moon",emojiId:"1F319",glyph:"🌙",label:"Moon",meaning:"Moon",note:"Night",role:"setting",x:25,y:32,scale:1.5,rotation:15},
 {id:"planet",emojiId:"1FA90",glyph:"🪐",label:"Planet",meaning:"Planet",note:"A distant world",role:"subject",x:50,y:43,scale:2,rotation:30},
 {id:"rocket",emojiId:"1F680",glyph:"🚀",label:"Rocket",meaning:"Rocket",note:"",role:"subject",x:75,y:65,scale:1,rotation:0}
],edges:[{id:"orbit",source:"moon",target:"planet",label:"orbits"},{id:"visit",source:"rocket",target:"planet",label:"visits"}]};
async function open(page:Page){
 await page.route("**/api/generations",r=>r.fulfill({json:{configured:true,models:["test/text"],maxOutputTokens:800}}));
 await page.goto('/');await page.getByRole('button',{name:'Playground',exact:true}).click();
 await restoreBoard(page,fixture);
 await expect(page.locator('.pg-node')).toHaveCount(3);await expect(page.locator('.pg-board')).toHaveAttribute('data-shapes-ready','true');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.pg-stage').scrollIntoViewIfNeeded();
}
const positions=(page:Page)=>page.locator('.pg-node').evaluateAll(nodes=>nodes.map(el=>({id:(el as HTMLElement).dataset.id,x:(el as HTMLElement).style.left,y:(el as HTMLElement).style.top,scale:(el as HTMLElement).dataset.scale,rotation:(el as HTMLElement).dataset.rotation})));
const camera=(page:Page)=>page.locator('.pg-world').getAttribute('style');

async function selectedCenter(page:Page){
 return page.locator('.pg-node[aria-pressed="true"]').evaluateAll(elements=>{
  const bounds=elements.map(el=>{const box=el.getBoundingClientRect(),angle=Number((el as HTMLElement).dataset.rotation)*Math.PI/180,size=parseFloat(getComputedStyle(el.querySelector(':scope>span')!).fontSize),radius=size/2*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)));return {x:box.x+box.width/2,y:box.y+box.height/2,radius};});
  return {x:(Math.min(...bounds.map(b=>b.x-b.radius))+Math.max(...bounds.map(b=>b.x+b.radius)))/2,y:(Math.min(...bounds.map(b=>b.y-b.radius))+Math.max(...bounds.map(b=>b.y+b.radius)))/2};
 });
}

test('canvas Undo, Redo and Reset shortcuts preserve native text editing and prevent page reload',async({page})=>{
 await open(page);let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 const original=await positions(page),moon=page.locator('[data-id="moon"]');await moon.focus();await moon.press('ArrowRight');const moved=await positions(page);expect(moved).not.toEqual(original);
 await page.keyboard.press('Control+z');expect(await positions(page)).toEqual(original);await page.keyboard.press('Control+Shift+z');expect(await positions(page)).toEqual(moved);
 await page.keyboard.press('Meta+z');expect(await positions(page)).toEqual(original);await page.keyboard.press('Meta+Shift+z');expect(await positions(page)).toEqual(moved);
 await page.getByRole('button',{name:'Context',exact:true}).click();const title=page.getByLabel('Scene title',{exact:true});await expect(title).toBeVisible();await title.focus();await title.press('End');await title.pressSequentially(' native');await title.press('Control+z');await expect(page.locator('.pg-node')).toHaveCount(3);expect(await positions(page)).toEqual(moved);
 await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();const search=page.getByLabel('Search emojis in English or Spanish');await search.pressSequentially('moon');await search.press('Control+z');expect(await positions(page)).toEqual(moved);
 const intercepted=await search.evaluate(el=>{const event=new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;});expect(intercepted).toBe(false);expect(navigations).toBe(0);
 await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();await page.locator('.pg-board').focus();await page.keyboard.press('Control+r');await page.getByRole('button',{name:'Discard and continue',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(0);await expect(page.getByLabel('Canvas zoom')).toHaveText('100%');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();expect(navigations).toBe(0);
});

test('paste centers an emoji or rotated group at the cursor after pan and zoom; off-canvas uses fallback',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await open(page);
 const moon=page.locator('[data-id="moon"]');await moon.focus();await moon.press('Enter');await page.keyboard.press('Control+c');
 const canvas=page.locator('.pg-board'),rect=(await canvas.boundingBox())!;
 await page.mouse.move(rect.x+15,rect.y+25);await page.mouse.down();await page.mouse.move(rect.x+90,rect.y+70,{steps:5});await page.mouse.up();
 await page.mouse.wheel(0,-350);await expect(page.getByLabel('Canvas zoom')).not.toHaveText('100%');
 const target={x:rect.x+rect.width*.7,y:rect.y+rect.height*.65};await page.mouse.move(target.x,target.y);await canvas.focus();await page.keyboard.press('Control+v');await expect(page.locator('.pg-node')).toHaveCount(4);
 let center=await selectedCenter(page);expect(center.x).toBeCloseTo(target.x,0);expect(center.y).toBeCloseTo(target.y,0);
 // A repeated paste at the same pointer location must not add an offset.
 await page.keyboard.press('Control+v');await expect(page.locator('.pg-node')).toHaveCount(5);center=await selectedCenter(page);expect(center.x).toBeCloseTo(target.x,0);expect(center.y).toBeCloseTo(target.y,0);
 await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await expect(page.locator('.pg-node')).toHaveCount(3);
 await moon.focus();await moon.press('Enter');await page.locator('[data-id="planet"]').focus();await page.locator('[data-id="planet"]').press('Shift+Enter');await page.keyboard.press('Control+c');
 await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await page.getByRole('button',{name:'Zoom out',exact:true}).click();const full=(await canvas.boundingBox())!,groupTarget={x:full.x+full.width*.6,y:full.y+full.height*.55};
 await page.mouse.move(groupTarget.x,groupTarget.y);await canvas.focus();await page.keyboard.press('Control+v');await expect(page.locator('.pg-node[aria-pressed="true"]')).toHaveCount(2);
 center=await selectedCenter(page);expect(center.x).toBeCloseTo(groupTarget.x,0);expect(center.y).toBeCloseTo(groupTarget.y,0);
 const pasted=await positions(page);expect(pasted.slice(3).map(n=>[n.scale,n.rotation])).toEqual(pasted.slice(0,2).map(n=>[n.scale,n.rotation]));
 await page.keyboard.press('Control+z');await expect(page.locator('.pg-node')).toHaveCount(3);await page.keyboard.press('Control+Shift+z');await expect(page.locator('.pg-node')).toHaveCount(5);
 await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await page.getByRole('button',{name:'Paste objects',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(7);center=await selectedCenter(page);
 const embedded=(await canvas.boundingBox())!;expect(center.x).toBeGreaterThan(embedded.x);expect(center.x).toBeLessThan(embedded.x+embedded.width);expect(center.y).toBeGreaterThan(embedded.y);expect(center.y).toBeLessThan(embedded.y+embedded.height);
});

test('icon toolbar has descriptive hover and focus tooltips, overlapping Arrange icon and grouped spacing',async({page})=>{
 await open(page);const toolbar=page.locator('.pg-space-toolbar');expect((await toolbar.innerText()).replace(/\s+/g,' ').trim()).toBe('Add emoji 3/80 100%');
 await expect(page.locator('.pg-arrange summary .lucide-bring-to-front')).toHaveCount(1);await expect(page.locator('.pg-edit-tools')).toHaveCSS('gap','12px');await expect(page.locator('.pg-view-tools')).toHaveCSS('gap','12px');
 await page.getByRole('button',{name:'Undo',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Undo the last canvas change');await expect(page.getByRole('tooltip')).toContainText('Ctrl+Z');
 await page.mouse.move(0,0);await page.keyboard.press('Tab');await page.getByRole('button',{name:'Reset canvas',exact:true}).focus();await expect(page.getByRole('tooltip')).toContainText('Ctrl+R');
 await page.locator('.pg-arrange summary').click();await expect(page.getByRole('tooltip')).toHaveCount(0);await expect(page.getByRole('button',{name:'Bring to front',exact:true})).toBeVisible();
 await page.locator('.pg-arrange summary').press('Escape');await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await page.getByRole('button',{name:'Copy selected objects',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Ctrl+C');await expect(page.locator('.pg-stage .pg-toolbar-tooltip')).toHaveCount(1);
 await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await page.mouse.move(0,0);await toolbar.screenshot({path:'/tmp/playground-icon-toolbar-desktop.png'});
});

test('copy/paste shortcuts preserve a group, clipboard snapshot, internal relationship and atomic Undo',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await open(page);
 await page.locator('[data-id="moon"]').focus();await page.locator('[data-id="moon"]').press('Enter');await page.locator('[data-id="planet"]').focus();await page.locator('[data-id="planet"]').press('Shift+Enter');
 await page.keyboard.press('Control+c');await expect(page.locator('.pg-canvas-notice')).toContainText('2 objects copied');
 await page.keyboard.press('Control+v');await expect(page.locator('.pg-node')).toHaveCount(5);await expect(page.locator('.pg-node[aria-pressed="true"]')).toHaveCount(2);
 const original=await positions(page);expect(original.slice(3).map(n=>[n.scale,n.rotation])).toEqual(original.slice(0,2).map(n=>[n.scale,n.rotation]));
 await page.getByRole('button',{name:'Context',exact:true}).click();await page.getByRole('button',{name:'Add relationships',exact:true}).click();await expect(page.locator('.pg-relationships')).toContainText('orbits');await expect(page.locator('.pg-relationships>div')).toHaveCount(3);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(3);await expect(page.locator('.pg-relationships>div')).toHaveCount(2);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(5);
 // Copy in an editable field must remain ordinary text copy.
 await page.getByLabel('Scene title',{exact:true}).fill('Text selection');await page.getByLabel('Scene title',{exact:true}).press('Control+a');await page.keyboard.press('Control+c');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Text selection');
});

test('copy icon and Paste work when the system clipboard is blocked',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('blocked')),readText:()=>Promise.reject(new Error('blocked'))}}));
 await open(page);await page.locator('[data-id="moon"]').focus();await page.locator('[data-id="moon"]').press('Enter');await page.getByRole('button',{name:'Copy selected emoji',exact:true}).click();
 await expect(page.locator('.pg-canvas-notice')).toContainText('Copied in this playground');await page.getByRole('button',{name:'Paste objects',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(4);
});

test('Layers selects hidden objects; Arrange changes persisted overlap order and supports Undo',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Layers',exact:true}).click();await page.getByRole('button',{name:'Select layer Moon',exact:true}).click();
 await page.locator('.pg-arrange summary').click();await page.getByRole('button',{name:'Bring to front',exact:true}).click();
 expect((await positions(page)).map(n=>n.id)).toEqual(['planet','rocket','moon']);await expect(page.locator('[data-id="moon"]')).toHaveCSS('z-index','3');
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await positions(page)).map(n=>n.id)).toEqual(['moon','planet','rocket']);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.locator(".pg-save")).not.toHaveText(/Saving|Guardando/);const snapshot=await savedBoard(page);await page.reload();await page.getByRole('button',{name:'Playground',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(0);await restoreBoard(page,snapshot);
 await expect.poll(async()=> (await positions(page)).map(n=>n.id)).toEqual(['planet','rocket','moon']);
});

test('Layers stays open for panel actions, dismisses outside, and restores focus only on Escape',async({page})=>{
 await open(page);const layers=page.getByRole('button',{name:'Layers',exact:true}),panel=page.locator('#pg-layers');
 await layers.click();await page.getByRole('button',{name:'Select layer Moon',exact:true}).click();await expect(panel).toBeVisible();await expect(layers).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(panel).toHaveCount(0);await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeFocused();await expect(page.getByLabel('Canvas zoom')).toHaveText('125%');
 await layers.click();await layers.click();await expect(panel).toHaveCount(0);await expect(layers).toHaveAttribute('aria-expanded','false');
 await layers.click();await page.getByRole('button',{name:'Select layer Planet',exact:true}).press('Escape');await expect(panel).toHaveCount(0);await expect(layers).toBeFocused();
 await layers.click();const rect=(await page.locator('.pg-board').boundingBox())!;await page.mouse.click(rect.x+15,rect.y+rect.height-60);await expect(panel).toHaveCount(0);await expect(page.locator('.pg-board')).toBeFocused();
 await layers.click();await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();await expect(panel).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Emoji library',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();await page.locator('.pg-space-toolbar').screenshot({path:'/tmp/playground-toolbar-grouped-desktop.png'});
});

test('fullscreen scales objects and restores the prior view after zooming in fullscreen',async({page})=>{
 await open(page);const beforeCamera=await camera(page),before=await page.locator('[data-id="moon"]').boundingBox();
 await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
 await expect.poll(async()=> (await page.locator('[data-id="moon"]').boundingBox())!.width).toBeGreaterThan(before!.width*1.1);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
 await expect.poll(()=>camera(page)).toBe(beforeCamera);await expect(page.locator('.pg-stage')).not.toHaveClass(/is-fullscreen/);
});

test('Fit establishes 100%; zoom steps, fullscreen and repeated Fit preserve object data',async({page})=>{
 await open(page);const original=await positions(page),moon=page.locator('[data-id="moon"]'),zoom=page.getByLabel('Canvas zoom');
 const fit=page.getByRole('button',{name:'Fit objects in view',exact:true}),zoomIn=page.getByRole('button',{name:'Zoom in',exact:true}),zoomOut=page.getByRole('button',{name:'Zoom out',exact:true});
 await fit.click();await expect(zoom).toHaveText('100%');const fittedWidth=(await moon.boundingBox())!.width;
 for(const percent of [125,150]){await zoomIn.click();await expect(zoom).toHaveText(`${percent}%`);expect((await moon.boundingBox())!.width).toBeCloseTo(fittedWidth*percent/100,0);}
 for(const percent of [125,100]){await zoomOut.click();await expect(zoom).toHaveText(`${percent}%`);}
 expect((await moon.boundingBox())!.width).toBeCloseTo(fittedWidth,0);
 await zoomIn.click();const embeddedCamera=await camera(page);await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
 await expect.poll(async()=> (await moon.boundingBox())!.width).toBeGreaterThan(fittedWidth*1.3);await expect(zoom).toHaveText('125%');
 await fit.click();await expect(zoom).toHaveText('100%');await zoomIn.click();await expect(zoom).toHaveText('125%');
 await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await expect.poll(()=>camera(page)).toBe(embeddedCamera);await expect(zoom).toHaveText('125%');
 const rect=(await page.locator('.pg-board').boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-20000);await expect(zoom).toHaveText('800%');await expect(zoomIn).toBeDisabled();
 await page.mouse.wheel(0,20000);await expect(zoom).toHaveText('10%');await expect(zoomOut).toBeDisabled();
 await fit.click();await expect(zoom).toHaveText('100%');expect((await moon.boundingBox())!.width).toBeCloseTo(fittedWidth,0);expect(await positions(page)).toEqual(original);
});

test('Fit enlarges small objects; three dropdowns preserve search, source selection, sorting and paging',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Zoom out',exact:true}).click();const before=(await page.locator('[data-id="moon"]').boundingBox())!.width;await page.getByRole('button',{name:'Fit objects in view',exact:true}).click();await expect(page.locator('.pg-canvas-notice')).toContainText('95%');await expect(page.getByLabel('Canvas zoom')).toHaveText('100%');expect((await page.locator('[data-id="moon"]').boundingBox())!.width).toBeGreaterThan(before);
 await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();await expect(page.getByRole('tablist')).toHaveCount(0);
 const picker=page.locator('.pg-floating-library');await expect(picker.getByRole('combobox')).toHaveCount(3);await expect(page.getByLabel('Subjects',{exact:true}).locator('option')).toHaveCount(17);
 await page.getByLabel('Category',{exact:true}).selectOption('3');await page.getByLabel('Subjects',{exact:true}).selectOption('ocean');await expect(page.getByLabel('Category',{exact:true})).toHaveValue('all');
 await page.getByLabel('Sort emojis',{exact:true}).selectOption('unicode');await page.getByLabel('Search emojis in English or Spanish').fill('octopus');await expect(page.getByRole('button',{name:'Add octopus',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add octopus',exact:true}).click();await expect(page.locator('.pg-node')).toHaveCount(4);
 await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();await expect(page.getByLabel('Search emojis in English or Spanish')).toHaveValue('octopus');
 await expect(page.getByLabel('Subjects',{exact:true})).toHaveValue('ocean');await expect(page.getByLabel('Sort emojis',{exact:true})).toHaveValue('unicode');
 await page.getByLabel('Search emojis in English or Spanish').fill('');await page.getByLabel('Category',{exact:true}).selectOption('3');await expect(page.getByLabel('Subjects',{exact:true})).toHaveValue('all');
 const codePoints=await page.locator('.pg-palette .pg-vector-glyph').evaluateAll(elements=>elements.map(e=>e.textContent!.codePointAt(0)!));expect(codePoints).toEqual([...codePoints].sort((a,b)=>a-b));
 await expect(page.getByRole('button',{name:'Next emojis',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Next emojis',exact:true}).click();await expect(page.locator('.pg-paging')).toContainText('Page 2 of');
 await page.getByLabel('Sort emojis',{exact:true}).selectOption('alphabetical');await expect(page.locator('.pg-paging')).toContainText('Page 1 of');
 await picker.screenshot({path:'/tmp/playground-dropdowns-fixed.png'});
});

test('phone dropdowns and layers fit the viewport with usable touch targets',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
 try{await page.addInitScript(()=>Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined}));await open(page);await page.getByRole('button',{name:'Enter fullscreen',exact:true}).tap();
  await page.getByRole('button',{name:'Open emoji picker',exact:true}).tap();await expect(page.locator('.pg-floating-library').getByRole('combobox')).toHaveCount(3);
  const picker=await page.locator('.pg-floating-library').boundingBox();expect(picker!.x).toBeGreaterThanOrEqual(0);expect(picker!.x+picker!.width).toBeLessThanOrEqual(390);expect(picker!.y+picker!.height).toBeLessThanOrEqual(844);
  await page.getByLabel('Subjects',{exact:true}).selectOption('ocean');await page.getByLabel('Search emojis in English or Spanish').fill('octopus');await page.getByRole('button',{name:'Add octopus',exact:true}).tap();await expect(page.locator('.pg-node')).toHaveCount(4);
  await page.getByRole('button',{name:'Close emoji picker',exact:true}).tap();await page.getByRole('button',{name:'Layers',exact:true}).tap();await page.getByRole('button',{name:'Select layer Moon',exact:true}).tap();await expect(page.locator('[data-id="moon"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#pg-layers')).toBeVisible();await page.getByRole('button',{name:'Fit objects in view',exact:true}).tap();await expect(page.locator('#pg-layers')).toHaveCount(0);await page.locator('.pg-space-toolbar').screenshot({path:'/tmp/playground-toolbar-grouped-phone.png'});
  await page.screenshot({path:'/tmp/playground-layers-phone-implemented.png'});
 }finally{await context.close();}
});
