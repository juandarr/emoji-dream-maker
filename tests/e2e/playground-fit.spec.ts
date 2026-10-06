import {expect,test,type Page} from '@playwright/test';
import {createRequire} from 'node:module';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as {PNG:{sync:{read:(buffer:Buffer)=>{width:number;height:number;data:Buffer}}}};

const board=(glyph:string,rotation=0,multiple=false)=>({schemaVersion:1,title:'',intent:'',interpretation:'',edges:[],nodes:[{id:'first',emojiId:'saved-emoji',glyph,label:'Saved emoji',meaning:'Saved emoji',note:'',role:'subject',x:multiple?20:50,y:multiple?30:50,scale:2,rotation},...(multiple?[{id:'second',emojiId:'another-emoji',glyph:'🌙',label:'Moon',meaning:'Moon',note:'',role:'setting',x:80,y:75,scale:1.5,rotation:315}]:[])]});
async function measurePaint(page:Page){
 const image=PNG.sync.read(await page.locator('.pg-board').screenshot({path:`/tmp/playground-fit-pixels-${page.viewportSize()!.width}.png`}));
 let left=image.width,right=-1,top=image.height,bottom=-1;
 // Screenshot rounding can include a parent border at the outermost pixel.
 // Ignore that two-pixel frame; the requested margin is larger even on phones.
 for(let y=2;y<image.height-2;y++)for(let x=2;x<image.width-2;x++){
  const i=(y*image.width+x)*4;
  if(image.data[i+3]>200&&Math.min(image.data[i],image.data[i+1],image.data[i+2])<235){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
 }
 return {left,right,top,bottom,width:image.width,height:image.height};
}
function assertFitted(bounds:Awaited<ReturnType<typeof measurePaint>>){
 const {left,right,top,bottom,width,height}=bounds;
 expect(left).toBeGreaterThanOrEqual(width*.025-3);expect(width-right).toBeGreaterThanOrEqual(width*.025-3);
 expect(top).toBeGreaterThanOrEqual(height*.025-3);expect(height-bottom).toBeGreaterThanOrEqual(height*.025-3);
 expect(Math.abs((left+right)/2-width/2)).toBeLessThanOrEqual(3);expect(Math.abs((top+bottom)/2-height/2)).toBeLessThanOrEqual(3);
 const coverage=Math.max((right-left)/width,(bottom-top)/height);expect(Math.abs(coverage-.95)).toBeLessThanOrEqual(4/Math.min(width,height));
}
for(const viewport of [{width:1600,height:1000},{width:390,height:844}])test(`Fit centers actual painted pixels within 95% at ${viewport.width}px, including full screen`,async({page})=>{
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/generations',r=>r.fulfill({json:{configured:true,models:['test/text']}}));await page.goto('/');await page.getByRole('button',{name:'Playground',exact:true}).click();
 // Exclude rounded screenshot corners and the development-only Next.js badge;
 // no artwork, font, object placement, or camera styling is changed.
 await page.addStyleTag({content:'.pg-board{border-radius:0!important}nextjs-portal{display:none!important}'});
 for(const [glyph,rotation,multiple] of [['💮',0,false],['🌙',0,false],['🍩',45,false],['❤️',135,false],['🇯🇵',0,false],['👩🏽‍🚀',25,false],['💮',37,true]] as const){
  await page.locator('input[type="file"]').setInputFiles({name:'fit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(board(glyph,rotation,multiple)))});
  await expect(page.locator('.pg-node').first()).toHaveAttribute('data-glyph',glyph);await expect(page.locator('.pg-board')).toHaveAttribute('data-shapes-ready','true');
  await page.locator('.pg-stage').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Fit objects in view',exact:true}).click();
  await expect(page.getByLabel('Canvas zoom')).toHaveText('100%');
  assertFitted(await measurePaint(page));
  if(glyph==='💮'&&!multiple){await page.locator('.pg-stage').screenshot({path:`/tmp/playground-flower-fit-fixed-${viewport.width}.png`});}
 }
 await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await page.getByRole('button',{name:'Fit objects in view',exact:true}).click();await expect(page.getByLabel('Canvas zoom')).toHaveText('100%');assertFitted(await measurePaint(page));
});
