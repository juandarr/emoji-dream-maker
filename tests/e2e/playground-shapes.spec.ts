import { restoreBoard } from "./helpers/playground-workspace";
import { test, expect } from "./helpers/account";
import {type Page} from "@playwright/test";
const fixture={schemaVersion:1,title:"Shape practice",intent:"",interpretation:"",nodes:[
  {id:"donut",emojiId:"1F369",glyph:"🍩",label:"Doughnut",meaning:"Doughnut",note:"",role:"subject",x:35,y:45,scale:4,rotation:0},
  {id:"heart",emojiId:"2764",glyph:"❤️",label:"Heart",meaning:"Heart",note:"",role:"subject",x:70,y:60,scale:3,rotation:0}
],edges:[]};
async function open(page:Page,board=fixture){
  await page.route("**/api/generations",r=>r.fulfill({json:{configured:true,models:["test/text"],maxOutputTokens:800}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();await page.emulateMedia({reducedMotion:"reduce"});
  await restoreBoard(page,board);
  await expect(page.locator(".pg-node")).toHaveCount(2);await expect(page.locator(".pg-board")).toHaveAttribute("data-shapes-ready","true");
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();
  await page.getByRole("button",{name:"Zoom out",exact:true}).click();await page.getByRole("button",{name:"Zoom out",exact:true}).click();await page.getByRole("button",{name:"Zoom out",exact:true}).click();
}
async function geometry(page:Page,id="donut"){
  return page.locator(`.pg-node[data-id="${id}"]`).evaluate(el=>{
    const b=el.getBoundingClientRect(),n=el as HTMLElement;
    return {x:b.x+b.width/2,y:b.y+b.height/2,size:parseFloat(n.style.width)*2/3,angle:Number(n.dataset.rotation)};
  });
}
function at(g:Awaited<ReturnType<typeof geometry>>,x:number,y:number){
  const angle=g.angle*Math.PI/180;return {x:g.x+g.size*(x*Math.cos(angle)-y*Math.sin(angle)),y:g.y+g.size*(x*Math.sin(angle)+y*Math.cos(angle))};
}
const positions=(page:Page)=>page.locator(".pg-node").evaluateAll(els=>els.map(el=>({left:(el as HTMLElement).style.left,top:(el as HTMLElement).style.top})));
async function dragFrom(page:Page,p:{x:number;y:number},dx=30,dy=20){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();}
async function area(page:Page,start:{x:number;y:number},end:{x:number;y:number}){
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
}

test("unselected dragging requires painted artwork, while selection keeps its whole drag frame",async({page})=>{
  await open(page);const node=page.locator('.pg-node[data-id="donut"]'),original=await positions(page);
  for(const offset of [[-.46,-.46],[0,-.055]] as const){
    const g=await geometry(page),camera=await page.locator(".pg-world").getAttribute("style");
    await dragFrom(page,at(g,offset[0],offset[1]));expect(await positions(page)).toEqual(original);await expect(node).toHaveAttribute("aria-pressed","false");await expect(page.locator(".pg-world")).not.toHaveAttribute("style",camera!);
  }
  let g=await geometry(page);const paint=at(g,-.28,0),camera=await page.locator(".pg-world").getAttribute("style");
  await dragFrom(page,paint);expect((await positions(page))[0]).not.toEqual(original[0]);await expect(node).toHaveAttribute("aria-pressed","false");await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
  g=await geometry(page);const select=at(g,-.28,0);await page.mouse.click(select.x,select.y);await expect(node).toHaveAttribute("aria-pressed","true");
  const selected=await positions(page);g=await geometry(page);await dragFrom(page,at(g,0,-.055));expect((await positions(page))[0]).not.toEqual(selected[0]);await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-selection-bounds")).toBeVisible();
  const moved=await positions(page);g=await geometry(page);await dragFrom(page,at(g,-.46,-.46));expect((await positions(page))[0]).not.toEqual(moved[0]);await expect(node).toHaveAttribute("aria-pressed","true");
  await page.screenshot({path:"/tmp/playground-shape-selected.png"});
});

test("area selection ignores transparent corners and holes at different rotations and zoom levels",async({page})=>{
  await open(page,{...fixture,nodes:[{...fixture.nodes[0],emojiId:"2B55",glyph:"⭕",label:"Circle"},fixture.nodes[1]]});const node=page.locator('.pg-node[data-id="donut"]');
  for(const angle of [0,45]){
    if(angle){await node.focus();await page.keyboard.press("Enter");await page.getByRole("button",{name:"Rotate selection",exact:true}).press("Shift+ArrowRight");await page.getByRole("button",{name:"Rotate selection",exact:true}).press("Shift+ArrowRight");await page.getByRole("button",{name:"Rotate selection",exact:true}).press("Shift+ArrowRight");}
    for(const zoom of [false,true]){
      if(zoom)await page.getByRole("button",{name:"Zoom in",exact:true}).click();
      const canvas=page.locator(".pg-board"),b=await canvas.boundingBox();await canvas.click({position:{x:b!.width-15,y:b!.height-15}});
      if(await page.getByRole("button",{name:"Select area",exact:true}).getAttribute("aria-pressed")==="false")await page.getByRole("button",{name:"Select area",exact:true}).click();
      const g=await geometry(page),blank=at(g,-.46,-.46),camera=await page.locator(".pg-world").getAttribute("style");
      await area(page,{x:blank.x-2,y:blank.y-2},{x:blank.x+2,y:blank.y+2});await expect(node).toHaveAttribute("aria-pressed","false");
      const original=await positions(page);await area(page,{x:g.x-6,y:g.y-6},{x:g.x+6,y:g.y+6});expect(await positions(page)).toEqual(original);await expect(node).toHaveAttribute("aria-pressed","false");
      const paint=at(g,-.4,0);await area(page,{x:g.x-g.size*.75,y:paint.y-3},{x:paint.x+3,y:paint.y+3});await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(1);
      await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);await canvas.click({position:{x:b!.width-15,y:b!.height-15}});if(zoom)await page.getByRole("button",{name:"Zoom out",exact:true}).click();
    }
  }
});

test("transparent padding passes clicks through to overlapping artwork underneath",async({page})=>{
  await open(page);
  // The top heart's empty lower corner overlays the solid part of the lower doughnut.
  const overlap={...fixture,nodes:[{...fixture.nodes[0],x:40,y:50},{...fixture.nodes[1],x:40,y:50}]};
  await restoreBoard(page,overlap);await expect(page.locator(".pg-board")).toHaveAttribute("data-shapes-ready","true");
  const g=await geometry(page,"heart"),p=at(g,.35,.35);
  await page.mouse.click(p.x,p.y);await expect(page.locator('.pg-node[data-id="heart"]')).toHaveAttribute("aria-pressed","false");await expect(page.locator('.pg-node[data-id="donut"]')).toHaveAttribute("aria-pressed","true");
});

test("touch respects the unselected silhouette and the selected drag region",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try{
    await page.addInitScript(()=>Object.defineProperty(Element.prototype,"requestFullscreen",{value:undefined}));await open(page);
    const cdp=await context.newCDPSession(page),node=page.locator('.pg-node[data-id="donut"]'),before=await positions(page);
    async function touchDrag(p:{x:number;y:number}){
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p]});for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:p.x+i*2,y:p.y+i*2}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }
    await touchDrag(at(await geometry(page),0,-.055));expect(await positions(page)).toEqual(before);await expect(node).toHaveAttribute("aria-pressed","false");
    const p=at(await geometry(page),-.28,0);await page.touchscreen.tap(p.x,p.y);await expect(node).toHaveAttribute("aria-pressed","true");
    await touchDrag(at(await geometry(page),0,-.055));expect((await positions(page))[0]).not.toEqual(before[0]);await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-selection-bounds")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await context.close();}
});

async function outerLeft(page:Page){
  const offset=await page.locator('.pg-node[data-id="donut"] .pg-vector-glyph').evaluate(el=>{
    const canvas=document.createElement("canvas");canvas.width=canvas.height=512;const ctx=canvas.getContext("2d")!;
    ctx.font=`${512*1024/1275}px ${getComputedStyle(el).fontFamily}`;const m=ctx.measureText(el.textContent!);ctx.fillText(el.textContent!,(512-m.width)/2,256+(m.fontBoundingBoxAscent-m.fontBoundingBoxDescent)/2);
    const pixels=ctx.getImageData(0,256,512,1).data;for(let x=0;x<512;x++)if(pixels[x*4+3]>=16)return x/512-.5;throw new Error("No painted edge");
  });return at(await geometry(page),offset,0);
}
test("near-edge mouse grabs follow the silhouette at rotation and zoom without expanding area selection",async({page})=>{
  await open(page,{...fixture,nodes:[{...fixture.nodes[0],emojiId:"2B55",glyph:"⭕",label:"Circle",scale:3},fixture.nodes[1]]});
  const node=page.locator('.pg-node[data-id="donut"]');
  for(const rotated of [false,true]){
    if(rotated){await node.focus();await node.press("Enter");for(let i=0;i<3;i++)await page.getByRole("button",{name:"Rotate selection",exact:true}).press("Shift+ArrowRight");await page.keyboard.press("Escape");await page.getByRole("button",{name:"Zoom in",exact:true}).click();}
    let edge=await outerLeft(page),g=await geometry(page),angle=g.angle*Math.PI/180;
    const near={x:edge.x-2*Math.cos(angle),y:edge.y-2*Math.sin(angle)},before=await positions(page),camera=await page.locator(".pg-world").getAttribute("style");
    await dragFrom(page,near);expect((await positions(page))[0]).not.toEqual(before[0]);await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);await expect(node).toHaveAttribute("aria-pressed","false");
    edge=await outerLeft(page);const far={x:edge.x-16*Math.cos(angle),y:edge.y-16*Math.sin(angle)},moved=await positions(page);await dragFrom(page,far);expect(await positions(page)).toEqual(moved);await expect(page.locator(".pg-world")).not.toHaveAttribute("style",camera!);
  }
  // Marquee selection still requires contact with the real artwork, not the pointer allowance.
  await node.focus();await node.press("Enter");for(let i=0;i<3;i++)await page.getByRole("button",{name:"Rotate selection",exact:true}).press("Shift+ArrowLeft");await page.keyboard.press("Escape");
  const edge=await outerLeft(page);await page.getByRole("button",{name:"Select area",exact:true}).click();await area(page,{x:edge.x-15,y:edge.y-8},{x:edge.x-2,y:edge.y+8});await expect(node).toHaveAttribute("aria-pressed","false");
});
