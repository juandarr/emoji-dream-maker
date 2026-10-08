import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Composition } from '../../src/features/playground/model';

async function open(page:Page) {
  await page.emulateMedia({reducedMotion:'reduce'});
  let index=0;
  await page.route('**/api/generations',route=>route.request().method()==='GET'
    ?route.fulfill({json:{configured:true,models:['test/text','test/other'],maxOutputTokens:800}})
    :route.request().method()==='DELETE'?route.fulfill({json:{code:'canceled'}})
    :route.fulfill({json:{result:{title:`Experiment ${++index}`,text:`Result ${index}`,model:'test/text',provider:'openrouter'}}}));
  await page.goto('/');await page.getByRole('button',{name:'Playground',exact:true}).click();
  await expect(page.locator('.pg-board')).toBeVisible();
}
async function add(page:Page) {
  await page.getByRole('button',{name:'Open emoji picker',exact:true}).click();
  await page.getByLabel('Search emojis in English or Spanish').fill('red heart');
  await page.getByRole('button',{name:'Add red heart',exact:true}).click();
  await page.getByRole('button',{name:'Close emoji picker',exact:true}).click();
}
async function save(page:Page){await page.locator('.cr-action-buttons').getByRole('button',{name:'Save creation',exact:true}).click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');}
const keep=(page:Page)=>page.getByRole('button',{name:'Keep in session',exact:true}).click();
async function rows(page:Page,collection='saved') {
  return page.evaluate(collection=>new Promise<any[]>((resolve,reject)=>{
    const r=indexedDB.open('dream-maker-playground-v1',2);r.onsuccess=()=>{const db=r.result,q=db.transaction('creations').objectStore('creations').index('membership').getAll(['local',collection]);q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);
  }),collection);
}
async function generate(page:Page,index:number) {
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(page.locator('.pg-output .pg-story-title')).toHaveText(`Experiment ${index}`);
  await expect.poll(async()=>(await rows(page,'temporary')).filter(r=>r.state.run?.status==='succeeded').length).toBe(index);
}

test('canvas-only save deduplicates, survives refresh and restores from nested Creations',async({page})=>{
  await open(page);await expect(page.getByRole('button',{name:'Save creation',exact:true}).first()).toBeDisabled();
  await add(page);await save(page);await save(page);
  await expect.poll(async()=>(await rows(page)).length).toBe(1);
  const record=(await rows(page))[0];expect(record.state.settings).toBeNull();expect(record.state.run).toBeNull();
  await page.locator('.pg-node').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cr-action-status')).toHaveText('Not saved to Creations');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');
  await page.reload();await page.getByRole('button',{name:/^Creations/}).click();
  await expect(page.locator('.cr-tree-canvas')).toHaveCount(1);
  await expect(page.locator('.cr-library-detail').getByRole('tab',{name:'Configuration',exact:true})).toBeDisabled();
  await page.locator('.cr-library-detail').getByRole('button',{name:'Restore state',exact:true}).click();
  await expect(page.locator('.pg-node')).toHaveAttribute('data-glyph','❤️');
  await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
});

test('identical canvas branches into configurations and repeated results; edited saves preserve versions',async({page})=>{
  await open(page);await add(page);await generate(page,1);await save(page);await generate(page,2);await save(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Text model',{exact:true}).selectOption('test/other');
  await expect(page.locator('.cr-action-status')).toHaveText('Not saved to Creations');await generate(page,3);await save(page);
  await page.getByRole('button',{name:/^Creations/}).click();
  await expect(page.locator('.cr-tree-canvas')).toHaveCount(1);await expect(page.locator('.cr-tree-branch')).toHaveCount(2);await expect(page.locator('.cr-tree-results button')).toHaveCount(3);
  await page.getByRole('button',{name:'Experiment 1',exact:true}).click();await expect(page.locator('.cr-library-detail .pg-story-prose')).toHaveText('Result 1');
  await page.locator('.cr-library-detail').getByRole('button',{name:'Restore state',exact:true}).click();
  await expect(page.getByLabel('Text model',{exact:true})).toHaveValue('test/text');
  const output=page.locator('.pg-output');await output.getByRole('button',{name:'Edit output',exact:true}).click();await output.getByLabel('Edit output',{exact:true}).fill('Edited version');await output.getByRole('button',{name:'Done editing',exact:true}).click();await save(page);
  await expect.poll(async()=>(await rows(page)).length).toBe(4);
  expect((await rows(page)).map(r=>r.state.run?.result?.text)).toContain('Result 1');
  await page.getByRole('button',{name:/^Creations/}).click();await expect(page.locator('.cr-tree-results button')).toHaveCount(4);
});

test('temporary restore protects current work; individual and bulk removal preserve saved work with Undo',async({page})=>{
  await open(page);await add(page);await keep(page);await expect(page.locator('.cr-checkpoint')).toHaveCount(1);await save(page);
  await page.locator('.pg-node').focus();await page.keyboard.press('ArrowRight');await keep(page);await expect(page.locator('.cr-checkpoint')).toHaveCount(2);
  const oldest=page.locator('.cr-checkpoint').last();await oldest.getByRole('button',{name:'Restore state',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Keep your current creation?',exact:true});await expect(dialog).toBeVisible();
  await dialog.locator('.cr-dialog-actions').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.cr-action-status')).toHaveText('Not saved to Creations');
  await oldest.getByRole('button',{name:'Restore state',exact:true}).click();await dialog.getByRole('button',{name:'Save and continue',exact:true}).click();await expect(page.locator('.cr-action-status')).toHaveText('Saved to Creations');
  await page.locator('.cr-checkpoint').first().locator('.pg-history-delete').click();await expect(page.locator('.cr-checkpoint')).toHaveCount(1);await expect(page.locator('.pg-node')).toHaveCount(1);
  await page.locator('.cr-temporary').getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(2);
  await page.getByLabel('Select all',{exact:true}).check();await page.getByRole('button',{name:'Remove selected (2)',exact:true}).click();
  await page.getByRole('dialog',{name:'Remove these temporary creations?',exact:true}).getByRole('button',{name:'Remove (2)',exact:true}).click();
  await expect(page.locator('.cr-checkpoint')).toHaveCount(0);expect((await rows(page)).length).toBe(2);
  await page.locator('.cr-temporary').getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(2);
  await page.getByRole('button',{name:'Remove all',exact:true}).click();await page.getByRole('dialog',{name:'Remove these temporary creations?',exact:true}).getByRole('button',{name:'Remove (2)',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(0);
  await page.getByRole('button',{name:/^Creations/}).click();await expect(page.locator('.cr-tree-canvas')).toHaveCount(2);
});

test('result-only restore keeps source inputs and cannot attach the reference to a new canvas',async({page})=>{
  await open(page);await add(page);await generate(page,1);await save(page);
  await page.locator('.pg-node').focus();await page.keyboard.press('ArrowRight');await save(page);
  await page.getByRole('button',{name:/^Creations/}).click();await page.getByRole('button',{name:'Experiment 1',exact:true}).click();
  const detail=page.locator('.cr-library-detail');await detail.locator('.cr-partial-restore summary').click();await detail.getByRole('checkbox',{name:'Canvas',exact:true}).uncheck();await detail.getByRole('checkbox',{name:'Configuration',exact:true}).uncheck();await detail.getByRole('button',{name:'Restore selected',exact:true}).click();
  await expect(page.locator('.cr-reference')).toContainText('Result from different inputs');await expect(page.locator('.pg-output .pg-story-prose')).toHaveText('Result 1');await save(page);
  const stored=await rows(page);expect(stored).toHaveLength(2);expect(stored.filter(r=>r.state.run)).toHaveLength(1);
});

test('cancel unblocks replacements immediately and ignores late completion without restoring deleted checkpoints',async({page})=>{
  await open(page);await add(page);
  let release=()=>{};const done=new Promise<void>(resolve=>{release=resolve;});let cancellations=0;
  await page.route('**/api/generations',async route=>{if(route.request().method()==='GET')return route.fallback();if(route.request().method()==='DELETE'){cancellations++;return route.fulfill({json:{code:'canceled'}});}await done;await route.fulfill({json:{result:{title:'Late completion',text:'Late result',model:'test/text',provider:'openrouter'}}}).catch(()=>{});});
  await page.getByRole('button',{name:'Generate',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(1);await expect(page.getByRole('button',{name:'New canvas',exact:true})).toBeDisabled();
  await page.locator('.cr-checkpoint').locator('.pg-history-delete').click();await expect(page.locator('.cr-checkpoint')).toHaveCount(0);
  await page.getByRole('button',{name:'Cancel generation',exact:true}).click();await expect(page.getByRole('button',{name:'New canvas',exact:true})).toBeEnabled();await expect.poll(()=>cancellations).toBe(1);
  await page.getByRole('button',{name:'New canvas',exact:true}).click();await page.getByRole('button',{name:'Discard and continue',exact:true}).click();release();
  await expect(page.locator('.pg-node')).toHaveCount(0);await expect(page.locator('.pg-output .pg-story-prose')).toHaveCount(0);await expect(page.locator('.cr-checkpoint')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Playground',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(0);
});

test('legacy attempts migrate once without a retention cap and saved views remain accessible in every theme and Spanish',async({page})=>{
  const board:Composition={schemaVersion:1,title:'Legacy experiment',intent:'',interpretation:'',edges:[],nodes:[{id:'heart',emojiId:'2764',glyph:'❤️',label:'red heart',meaning:'Love',role:'subject',note:'',x:45,y:45,scale:1,rotation:0}]};
  const settings={kind:'poem',locale:'en',tone:'gentle',model:'test/text'};
  const legacy=Array.from({length:24},(_,i)=>({id:`legacy-${i}`,createdAt:Date.now()-i*1000,identity:'legacy-input',brief:{interpretation:'Love'},board,settings,status:i<2?'failed':'succeeded',...(i<2?{}:{result:{title:`Legacy ${i}`,text:`Result ${i}`,model:'test/text',provider:'openrouter'}})}));
  await page.addInitScript(async({board,legacy})=>{
    if(sessionStorage.getItem('legacy-seeded'))return;sessionStorage.setItem('legacy-seeded','1');
    await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('dream-maker-playground-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('workspace');r.onsuccess=()=>{const db=r.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({board,runs:legacy},'active');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  },{board,legacy});
  await open(page);await expect.poll(async()=>(await rows(page,'temporary')).length).toBe(24);await expect(page.locator('.cr-checkpoint')).toHaveCount(15);await page.getByRole('button',{name:'Show more (9)',exact:true}).click();await expect(page.locator('.cr-checkpoint')).toHaveCount(24);
  await page.locator('.cr-checkpoint').filter({hasText:'Legacy 2'}).first().getByRole('button',{name:'Save creation',exact:true}).click();await page.getByRole('button',{name:/^Creations/}).click();
  for(const theme of ['classic','cyberpunk','solarpunk','retro']) {
    await page.getByLabel('Themes',{exact:true}).selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).exclude('nextjs-portal').analyze();expect(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),theme).toEqual([]);
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1440,height:1000});
  }
  await page.screenshot({path:'/tmp/creations-desktop.png',fullPage:true});
  await page.getByLabel('Interface language').selectOption('es');await expect(page.getByRole('button',{name:/^Creaciones/})).toBeVisible();await expect(page.getByRole('button',{name:'Restaurar estado',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/creations-phone.png',fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Espacio creativo',exact:true}).click();await expect.poll(async()=>(await rows(page,'temporary')).length).toBe(24);expect((await rows(page)).length).toBe(1);
});


test('another tab cannot overwrite a newer temporary output with stale edits',async({page,context})=>{
  await open(page);await add(page);await generate(page,1);
  const other=await context.newPage();await open(other);await other.locator('.cr-checkpoint').getByRole('button',{name:'Restore state',exact:true}).click();
  const edit=async(target:Page,text:string)=>{const output=target.locator('.pg-output');await output.getByRole('button',{name:'Edit output',exact:true}).click();await output.getByLabel('Edit output',{exact:true}).fill(text);await output.getByRole('button',{name:'Done editing',exact:true}).click();};
  await edit(page,'Newer output');await expect.poll(async()=>(await rows(page,'temporary'))[0].state.run.result.text).toBe('Newer output');
  await edit(other,'Stale output');await expect(other.locator('.storage-notice')).toContainText('Another tab changed this creation');
  expect((await rows(page,'temporary'))[0].state.run.result.text).toBe('Newer output');await expect(other.locator('.pg-output .pg-story-prose')).toHaveText('Stale output');
  await keep(other);expect((await rows(page,'temporary')).map(r=>r.state.run.result.text)).toEqual(expect.arrayContaining(['Newer output','Stale output']));await other.close();
});


test('restored unavailable models stay visible and require an explicit choice before generating',async({page})=>{
  await open(page);await add(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Text model',{exact:true}).selectOption('test/other');await save(page);
  await page.route('**/api/generations',route=>route.request().method()==='GET'?route.fulfill({json:{configured:true,models:['test/text'],maxOutputTokens:800}}):route.fallback());
  await page.reload();await page.getByRole('button',{name:/^Creations/}).click();await page.locator('.cr-tree-branch').getByRole('button',{name:'Interpretation test/other',exact:true}).click();await page.locator('.cr-library-detail').getByRole('button',{name:'Restore state',exact:true}).click();
  await expect(page.getByRole('button',{name:'Generate',exact:true})).toBeDisabled();await expect(page.locator('.pg-header-issue')).toContainText('Saved model unavailable');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Text model',{exact:true})).toHaveValue('test/other');await page.getByLabel('Text model',{exact:true}).selectOption('test/text');await generate(page,1);
});
