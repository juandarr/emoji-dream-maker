import { savedBoard, importSavedBoard } from "./helpers/playground-workspace";
import {expect,test,type Page,type Locator} from "@playwright/test";
const fixture={schemaVersion:1,title:"Transform practice",intent:"",interpretation:"",nodes:[
  {id:"octopus",emojiId:"1F419",glyph:"🐙",label:"Octopus",meaning:"Octopus",note:"",role:"subject",x:20,y:35},
  {id:"bear",emojiId:"1F9F8",glyph:"🧸",label:"Bear",meaning:"Bear",note:"",role:"subject",x:45,y:35},
  {id:"flag",emojiId:"1F1EF-1F1F5",glyph:"🇯🇵",label:"Japan",meaning:"Japan",note:"",role:"setting",x:80,y:70}
],edges:[{id:"friends",source:"octopus",target:"bear",label:"friends"},{id:"home",source:"bear",target:"flag",label:"home"}]};
async function open(page:Page){
  await page.route("**/api/generations",r=>r.fulfill({json:{configured:true,models:["test/text"],maxOutputTokens:800}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"legacy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture))});
  await expect(page.locator(".pg-node")).toHaveCount(3);await page.emulateMedia({reducedMotion:"reduce"});
  // The authoring panels are now above the canvas; pointer coordinates need a visible stage.
  await page.locator(".pg-stage").scrollIntoViewIfNeeded();
}
const values=(page:Page)=>page.locator(".pg-node").evaluateAll(els=>els.map(el=>({x:parseFloat((el as HTMLElement).style.left),y:parseFloat((el as HTMLElement).style.top),scale:Number((el as HTMLElement).dataset.scale),rotation:Number((el as HTMLElement).dataset.rotation)})));
async function drag(page:Page,target:Locator,dx:number,dy:number){const b=await target.boundingBox();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await page.mouse.down();await page.mouse.move(b!.x+b!.width/2+dx,b!.y+b!.height/2+dy,{steps:12});await page.mouse.up();}
async function selectPair(page:Page){
  await page.getByRole("button",{name:"Select area",exact:true}).click();
  const nodes=page.locator(".pg-node"),a=await nodes.nth(0).boundingBox(),b=await nodes.nth(1).boundingBox();
  await page.mouse.move(Math.min(a!.x,b!.x)-20,Math.min(a!.y,b!.y)-20);await page.mouse.down();
  await page.mouse.move(Math.max(a!.x+a!.width,b!.x+b!.width)+20,Math.max(a!.y+a!.height,b!.y+b!.height)+20,{steps:12});await expect(page.locator(".pg-selection-area")).toBeVisible();await page.mouse.up();
  await expect(nodes.nth(0)).toHaveAttribute("aria-pressed","true");await expect(nodes.nth(1)).toHaveAttribute("aria-pressed","true");await expect(nodes.nth(2)).toHaveAttribute("aria-pressed","false");
}
test("area-selected groups move, resize, rotate, persist and delete in single undo steps",async({page})=>{
  await open(page);await selectPair(page);const original=await values(page);
  await expect(page.locator(".pg-group-inspector")).toContainText("2 objects selected");
  await drag(page,page.locator(".pg-node").nth(0),60,40);const moved=await values(page);
  expect(moved[0].x-original[0].x).toBeCloseTo(moved[1].x-original[1].x);expect(moved[0].y-original[0].y).toBeCloseTo(moved[1].y-original[1].y);expect(moved[2]).toEqual(original[2]);
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(original);
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await values(page)).toEqual(moved);
  await drag(page,page.getByRole("button",{name:"Resize selection",exact:true}),80,60);const resized=await values(page);
  expect(resized[0].scale).toBeGreaterThan(1);expect(resized[0].scale).toBeCloseTo(resized[1].scale);expect(resized[2]).toEqual(original[2]);
  expect((resized[1].x-resized[0].x)/(moved[1].x-moved[0].x)).toBeCloseTo(resized[0].scale);
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(moved);
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await values(page)).toEqual(resized);
  const bounds=await page.locator(".pg-group-bounds").boundingBox(),handle=await page.getByRole("button",{name:"Rotate selection",exact:true}).boundingBox();
  const center={x:bounds!.x+bounds!.width/2,y:bounds!.y+bounds!.height/2},start={x:handle!.x+handle!.width/2,y:handle!.y+handle!.height/2};const radius=Math.hypot(start.x-center.x,start.y-center.y),angle=Math.atan2(start.y-center.y,start.x-center.x);
  await page.mouse.move(start.x,start.y);await page.mouse.down();for(let i=1;i<=12;i++)await page.mouse.move(center.x+radius*Math.cos(angle+Math.PI/2*i/12),center.y+radius*Math.sin(angle+Math.PI/2*i/12));await page.mouse.up();
  const rotated=await values(page);expect(rotated[0].rotation).toBeCloseTo(90,0);expect(rotated[1].rotation).toBeCloseTo(90,0);expect(rotated[2]).toEqual(original[2]);
  await page.screenshot({path:"/tmp/playground-group-transform.png",fullPage:true});
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(resized);
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await values(page)).toEqual(rotated);
  await page.locator(".pg-object-delete").click();await expect(page.locator(".pg-node")).toHaveCount(1);await expect(page.locator(".pg-relationships")).toHaveCount(0);
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(rotated);await expect(page.locator(".pg-relationships")).toContainText("friends");
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();const snapshot=await savedBoard(page);await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(0);await importSavedBoard(page,snapshot);await expect.poll(()=>values(page)).toEqual(rotated);
  await page.locator(".pg-node").nth(0).click();await page.locator(".pg-node").nth(1).click({modifiers:["Shift"]});await page.keyboard.press("Delete");await expect(page.locator(".pg-node")).toHaveCount(1);
});

test("single-object handles work with keyboard and cancel pointer transforms on Escape",async({page})=>{
  await open(page);const node=page.locator(".pg-node").nth(0);await node.click();const before=await values(page);
  const resize=page.getByRole("button",{name:"Resize selection",exact:true});await resize.focus();await resize.press("ArrowRight");await expect(node).toHaveAttribute("data-scale","1.1");
  const rotate=page.getByRole("button",{name:"Rotate selection",exact:true});await rotate.focus();await rotate.press("ArrowRight");await expect(node).toHaveAttribute("data-rotation","5");
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(node).toHaveAttribute("data-rotation","0");await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(before);
  const box=await resize.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+80,box!.y+box!.height/2+80,{steps:8});
  expect((await values(page))[0].scale).toBeGreaterThan(1);await page.keyboard.press("Escape");await page.mouse.up();expect(await values(page)).toEqual(before);await expect(node).toHaveAttribute("aria-pressed","false");
  await node.click();await drag(page,resize,30,30);expect((await values(page))[0].scale).toBeGreaterThan(1);
  await page.locator(".pg-board-menu summary").click();const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export board",exact:true}).click();const exported=await download;await exported.saveAs("/tmp/playground-transforms.json");
  await page.getByRole("button",{name:"Reset canvas",exact:true}).click();await page.locator('input[type="file"]').setInputFiles("/tmp/playground-transforms.json");expect((await values(page))[0].scale).toBeGreaterThan(1);
});

test("area selection maps through a zoomed and panned camera",async({page})=>{
  await open(page);const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox();
  await page.mouse.move(rect!.x+rect!.width*.9,rect!.y+rect!.height*.1);await page.mouse.down();await page.mouse.move(rect!.x+rect!.width*.9+30,rect!.y+rect!.height*.1+20,{steps:8});await page.mouse.up();
  await page.mouse.move(rect!.x+rect!.width*.3,rect!.y+rect!.height*.35);await page.mouse.wheel(0,-150);await expect(page.getByLabel("Canvas zoom")).not.toHaveText("100%");
  const camera=await page.locator(".pg-world").getAttribute("style");await selectPair(page);await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
  // The Shift shortcut supports drawing backwards without changing the camera.
  await page.getByRole("button",{name:"Select area",exact:true}).click();await canvas.click({position:{x:15,y:15}});
  const nodes=page.locator(".pg-node"),a=await nodes.nth(0).boundingBox(),b=await nodes.nth(1).boundingBox();
  await page.keyboard.down("Shift");await page.mouse.move(b!.x+b!.width+20,b!.y+b!.height+20);await page.mouse.down();await page.mouse.move(a!.x-20,a!.y-20,{steps:10});await page.mouse.up();await page.keyboard.up("Shift");
  await expect(nodes.nth(0)).toHaveAttribute("aria-pressed","true");await expect(nodes.nth(1)).toHaveAttribute("aria-pressed","true");await expect(nodes.nth(2)).toHaveAttribute("aria-pressed","false");await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
});

test("touch area selection and group resize retain a usable phone layout",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try{
    await page.addInitScript(()=>Object.defineProperty(Element.prototype,"requestFullscreen",{value:undefined}));await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).tap();
    await page.getByRole("button",{name:"Select area",exact:true}).tap();const nodes=page.locator(".pg-node"),a=await nodes.nth(0).boundingBox(),b=await nodes.nth(1).boundingBox();const cdp=await context.newCDPSession(page);
    const start={x:Math.min(a!.x,b!.x)-10,y:Math.min(a!.y,b!.y)-10},end={x:Math.max(a!.x+a!.width,b!.x+b!.width)+10,y:Math.max(a!.y+a!.height,b!.y+b!.height)+10};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[start]});for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(nodes.nth(0)).toHaveAttribute("aria-pressed","true");await expect(nodes.nth(1)).toHaveAttribute("aria-pressed","true");
    const handle=await page.getByRole("button",{name:"Resize selection",exact:true}).boundingBox(),p={x:handle!.x+handle!.width/2,y:handle!.y+handle!.height/2};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p]});for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:p.x+4*i,y:p.y+3*i}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    expect((await values(page))[0].scale).toBeGreaterThan(1);expect((await values(page))[1].scale).toBeGreaterThan(1);
    const bounds=await page.locator(".pg-group-bounds").boundingBox(),rotation=await page.getByRole("button",{name:"Rotate selection",exact:true}).boundingBox();
    const center={x:bounds!.x+bounds!.width/2,y:bounds!.y+bounds!.height/2},rstart={x:rotation!.x+rotation!.width/2,y:rotation!.y+rotation!.height/2},radius=Math.hypot(rstart.x-center.x,rstart.y-center.y),angle=Math.atan2(rstart.y-center.y,rstart.x-center.x);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[rstart]});for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:center.x+radius*Math.cos(angle+Math.PI/2*i/12),y:center.y+radius*Math.sin(angle+Math.PI/2*i/12)}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const rotated=await values(page);expect(rotated[0].rotation).toBeCloseTo(90,0);expect(rotated[1].rotation).toBeCloseTo(90,0);
    const groupFrame=await measureFrame(page),o={x:groupFrame.x,y:groupFrame.y};
    expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains("pg-selection-drag"),o)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[o]});for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:o.x+3*i,y:o.y+2*i}]});await expect(page.locator(".pg-selection-bounds")).toBeVisible();await expect(nodes.nth(0)).toHaveAttribute("aria-pressed","true");await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const moved=await values(page);expect(moved[0].x-rotated[0].x).toBeCloseTo(moved[1].x-rotated[1].x);expect(moved[0].x).toBeGreaterThan(rotated[0].x);expect(moved[2]).toEqual(rotated[2]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"/tmp/playground-group-phone.png"});
    await page.locator(".pg-board").tap({position:{x:15,y:30}});await expect(nodes.nth(0)).toHaveAttribute("aria-pressed","false");await expect(nodes.nth(1)).toHaveAttribute("aria-pressed","false");
  }finally{await context.close();}
});

async function measureFrame(page:Page){
  return page.locator(".pg-selection-bounds").evaluate(el=>{
    const frame=el as HTMLElement,board=document.querySelector(".pg-board")!.getBoundingClientRect(),rotate=document.querySelector(".pg-transform-handle.rotate")!.getBoundingClientRect();
    const matrix=new DOMMatrixReadOnly(getComputedStyle(frame).transform);
    return {x:board.x+Number(frame.dataset.centerX),y:board.y+Number(frame.dataset.centerY),width:parseFloat(frame.style.width),height:parseFloat(frame.style.height),angle:Number(frame.dataset.rotation),a:matrix.a,b:matrix.b,rotateX:rotate.x+rotate.width/2,rotateY:rotate.y+rotate.height/2};
  });
}
async function rotateSelection(page:Page,degrees:number){
  const frame=await measureFrame(page),start={x:frame.rotateX,y:frame.rotateY},radius=Math.hypot(start.x-frame.x,start.y-frame.y),angle=Math.atan2(start.y-frame.y,start.x-frame.x);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  for(let i=1;i<=12;i++)await page.mouse.move(frame.x+radius*Math.cos(angle+degrees*Math.PI/180*i/12),frame.y+radius*Math.sin(angle+degrees*Math.PI/180*i/12));
  // Validate during the gesture, before committing the document.
  const preview=await measureFrame(page);expect(preview.angle).toBeCloseTo((frame.angle+degrees+360)%360,0);
  await page.mouse.up();return frame;
}
function expectAttachedControl(frame:Awaited<ReturnType<typeof measureFrame>>){
  const angle=frame.angle*Math.PI/180,radius=frame.height/2+30;
  expect(frame.rotateX-frame.x).toBeCloseTo(radius*Math.sin(angle),0);expect(frame.rotateY-frame.y).toBeCloseTo(-radius*Math.cos(angle),0);
  expect(frame.a).toBeCloseTo(Math.cos(angle),4);expect(frame.b).toBeCloseTo(Math.sin(angle),4);
}
test("Shift shows the standard arrow on canvas and emojis, and resets on release and blur",async({page})=>{
  await open(page);const canvas=page.locator(".pg-board"),node=page.locator(".pg-node").first();
  await canvas.hover({position:{x:15,y:15}});await expect(canvas).toHaveCSS("cursor","grab");
  await page.keyboard.down("Shift");await expect(canvas).toHaveCSS("cursor","default");await node.hover();await expect(node).toHaveCSS("cursor","default");
  await page.keyboard.up("Shift");await expect(canvas).toHaveCSS("cursor","grab");await expect(node).toHaveCSS("cursor","grab");
  await page.getByRole("button",{name:"Select area",exact:true}).click();await expect(canvas).toHaveCSS("cursor","crosshair");
  await page.keyboard.down("Shift");await expect(canvas).toHaveCSS("cursor","default");await page.evaluate(()=>window.dispatchEvent(new Event("blur")));await expect(canvas).toHaveCSS("cursor","crosshair");await page.keyboard.up("Shift");
});

test("a narrow area touching painted artwork selects the emoji without enclosing it",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
  await page.getByRole("button",{name:"Select area",exact:true}).click();const node=page.locator(".pg-node").first();
  for(const zoomStep of [0,1]){
    if(zoomStep)await page.getByRole("button",{name:"Zoom in",exact:true}).click();
    for(const overlap of [6,8]){
    const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox();await canvas.click({position:{x:rect!.width-15,y:rect!.height-15}});
    const art=await node.locator(".pg-artwork").boundingBox();
    await page.mouse.move(art!.x-20,art!.y-20);await page.mouse.down();await page.mouse.move(art!.x+overlap,art!.y+art!.height+20,{steps:10});await page.mouse.up();
    await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(1);
    await expect(page.locator(".pg-selection-bounds")).toHaveCSS("border-top-width","2px");await expect(page.locator(".pg-selection-bounds")).toHaveCSS("border-top-style","dashed");
    }
  }
});

test("single and group dashed frames and controls stay attached through rotation, zoom and undo",async({page})=>{
  await open(page);const node=page.locator(".pg-node").first();await node.click();
  const border=page.locator(".pg-selection-bounds"),resize=page.getByRole("button",{name:"Resize selection",exact:true});
  await expect(border).toHaveCSS("border-top-width","2px");await expect(border).toHaveCSS("border-top-style","dashed");await expect(resize).toHaveCSS("cursor","nwse-resize");await expect(resize.locator('svg path[d="m5 5 14 14"]')).toHaveCount(1);
  const original=await rotateSelection(page,45),single=await measureFrame(page);expectAttachedControl(single);expect(single.width).toBeCloseTo(original.width);expect(single.height).toBeCloseTo(original.height);await expect(resize).toHaveCSS("cursor","ns-resize");
  await page.screenshot({path:"/tmp/playground-single-selection-45.png",fullPage:true});
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect((await measureFrame(page)).angle).toBe(0);await page.getByRole("button",{name:"Redo",exact:true}).click();expectAttachedControl(await measureFrame(page));
  // Resizing a rotated object increases its size along the rotated corner direction.
  const handle=await resize.boundingBox(),x=handle!.x+handle!.width/2,y=handle!.y+handle!.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+35,{steps:10});await expect(resize).toHaveCSS("cursor","ns-resize");await page.mouse.up();expect((await values(page))[0].scale).toBeGreaterThan(1);expectAttachedControl(await measureFrame(page));
  await page.locator(".pg-node").nth(1).click({modifiers:["Shift"]});await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);
  const beforeGroup=await rotateSelection(page,45),group=await measureFrame(page);expectAttachedControl(group);expect(group.angle).toBeCloseTo(90,0);expect(group.width).toBeCloseTo(beforeGroup.width);expect(group.height).toBeCloseTo(beforeGroup.height);await expect(resize).toHaveCSS("cursor","nesw-resize");
  await expect(border).toHaveCSS("border-top-width","2px");await page.screenshot({path:"/tmp/playground-rotated-selection-frame.png",fullPage:true});
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();await expect(border).toHaveCSS("border-top-width","2px");expectAttachedControl(await measureFrame(page));
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect((await measureFrame(page)).angle).toBeCloseTo(45,0);await page.getByRole("button",{name:"Redo",exact:true}).click();expectAttachedControl(await measureFrame(page));
  const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox();await canvas.click({position:{x:rect!.width-15,y:rect!.height-15}});await expect(border).toHaveCount(0);
});

test("touch gets the same partial selection and rotating single-object frame",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try{
    await page.addInitScript(()=>Object.defineProperty(Element.prototype,"requestFullscreen",{value:undefined}));await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).tap();
    await page.getByRole("button",{name:"Select area",exact:true}).tap();const node=page.locator(".pg-node").first(),art=await node.locator(".pg-artwork").boundingBox(),cdp=await context.newCDPSession(page);
    const start={x:art!.x-20,y:art!.y-20},end={x:art!.x+6,y:art!.y+art!.height+20};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[start]});for(let i=1;i<=10;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:start.x+(end.x-start.x)*i/10,y:start.y+(end.y-start.y)*i/10}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-selection-bounds")).toHaveCSS("border-top-style","dashed");await expect(page.locator(".pg-selection-bounds")).toHaveCSS("border-top-width","2px");
    const frame=await measureFrame(page),r=Math.hypot(frame.rotateX-frame.x,frame.rotateY-frame.y),angle=Math.atan2(frame.rotateY-frame.y,frame.rotateX-frame.x);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:frame.rotateX,y:frame.rotateY}]});for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:frame.x+r*Math.cos(angle+Math.PI/4*i/12),y:frame.y+r*Math.sin(angle+Math.PI/4*i/12)}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const turned=await measureFrame(page);expect(turned.angle).toBeCloseTo(45,0);expectAttachedControl(turned);await expect(page.locator('.pg-transform-handle.resize svg path[d="m5 5 14 14"]')).toHaveCount(1);await page.screenshot({path:"/tmp/playground-single-selection-phone.png"});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{await context.close();}
});

test("rotated selection controls remain reachable near canvas edges",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await page.locator(".pg-node").first().click();
  const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox(),frame=await measureFrame(page),dx=rect!.x+15-frame.x,dy=rect!.y+25-frame.y;
  const start={x:rect!.x+rect!.width-30,y:rect!.y+rect!.height-30};await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:12});await page.mouse.up();
  for(const control of ["Resize selection","Rotate selection","Delete selected object"]){
    const handle=page.getByRole("button",{name:control,exact:true}),box=await handle.boundingBox();await expect(handle).toBeVisible();expect(box!.x).toBeGreaterThanOrEqual(rect!.x);expect(box!.y).toBeGreaterThanOrEqual(rect!.y);expect(box!.x+box!.width).toBeLessThanOrEqual(rect!.x+rect!.width);expect(box!.y+box!.height).toBeLessThanOrEqual(rect!.y+rect!.height);
  }
  await expect(page.locator(".pg-selection-connector line")).toHaveCount(1);
  await page.getByRole("button",{name:"Rotate selection",exact:true}).press("ArrowRight");await expect(page.locator(".pg-node").first()).toHaveAttribute("data-rotation","5");
  await page.getByRole("button",{name:"Delete selected object",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(2);
});

test("selected individual keeps its frame and all controls during and after movement",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();
  const node=page.locator(".pg-node").first();await node.click();const original=await values(page),before=await measureFrame(page),camera=await page.locator(".pg-world").getAttribute("style");
  await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+70,before.y+45,{steps:10});
  await expect(node).toHaveAttribute("aria-pressed","true");await expect(node).toHaveCSS("cursor","grabbing");await expect(page.locator(".pg-selection-bounds")).toBeVisible();
  for(const name of ["Resize selection","Rotate selection","Delete selected object"])await expect(page.getByRole("button",{name,exact:true})).toBeVisible();
  const during=await measureFrame(page);expect(during.x-before.x).toBeCloseTo(70);expect(during.y-before.y).toBeCloseTo(45);expectAttachedControl(during);
  await page.screenshot({path:"/tmp/playground-single-drag-selection.png"});await page.mouse.up();
  await expect(node).toHaveAttribute("aria-pressed","true");expect(await measureFrame(page)).toEqual(during);await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
  const moved=await values(page);expect(moved[0].x).toBeGreaterThan(original[0].x);expect(moved.slice(1)).toEqual(original.slice(1));
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(original);await expect(node).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await values(page)).toEqual(moved);await expect(node).toHaveAttribute("aria-pressed","true");
});

test("empty group interior moves the selection without panning, including rotated and zoomed frames",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await selectPair(page);
  // The selection surface takes priority inside the frame even with Select area active.
  for(const rotated of [false,true]){
    if(rotated){await rotateSelection(page,45);await page.getByRole("button",{name:"Zoom in",exact:true}).click();}
    const before=await measureFrame(page),original=await values(page),camera=await page.locator(".pg-world").getAttribute("style");
    expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains("pg-selection-drag"),before)).toBe(true);
    await page.mouse.click(before.x,before.y);await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);
    await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+50,before.y+30,{steps:10});
    await expect(page.locator(".pg-selection-drag")).toHaveCSS("cursor","grabbing");await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);await expect(page.locator(".pg-selection-bounds")).toBeVisible();
    const during=await measureFrame(page);expect(during.x-before.x).toBeCloseTo(50);expect(during.y-before.y).toBeCloseTo(30);expect(during.angle).toBeCloseTo(before.angle);expectAttachedControl(during);
    if(rotated)await page.screenshot({path:"/tmp/playground-group-interior-drag.png"});
    await page.mouse.up();await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);expect(await measureFrame(page)).toEqual(during);await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
    const moved=await values(page);expect(moved[0].x-original[0].x).toBeCloseTo(moved[1].x-original[1].x);expect(moved[0].y-original[0].y).toBeCloseTo(moved[1].y-original[1].y);expect(moved[2]).toEqual(original[2]);
    expect(moved[0].scale).toBe(original[0].scale);expect(moved[0].rotation).toBe(original[0].rotation);
    await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await values(page)).toEqual(original);await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);
    await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await values(page)).toEqual(moved);
  }
  // A corner of the rotated frame's axis-aligned bounding box is outside the true drag area.
  await page.getByRole("button",{name:"Select area",exact:true}).click();const bounds=await page.locator(".pg-selection-bounds").boundingBox(),start={x:bounds!.x+3,y:bounds!.y+3};
  expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.classList.contains("pg-board"),start)).toBe(true);
  const original=await values(page),camera=await page.locator(".pg-world").getAttribute("style");
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+25,start.y+15,{steps:8});await page.mouse.up();expect(await values(page)).toEqual(original);await expect(page.locator(".pg-world")).not.toHaveAttribute("style",camera!);
});

test("selection surface preserves Shift area selection and cancellation without blocking emojis",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await selectPair(page);
  const frame=await measureFrame(page),original=await values(page),camera=await page.locator(".pg-world").getAttribute("style");
  await page.keyboard.down("Shift");await page.mouse.move(frame.x,frame.y);await page.mouse.down();await page.mouse.move(frame.x+10,frame.y+12,{steps:8});await expect(page.locator(".pg-selection-area")).toBeVisible();await page.mouse.up();await page.keyboard.up("Shift");
  expect(await values(page)).toEqual(original);await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);await expect(page.locator(".pg-world")).toHaveAttribute("style",camera!);
  await page.mouse.move(frame.x,frame.y);await page.mouse.down();await page.mouse.move(frame.x+40,frame.y+25,{steps:8});expect(await values(page)).not.toEqual(original);await page.keyboard.press("Escape");await page.mouse.up();expect(await values(page)).toEqual(original);
  await page.locator('input[type="file"]').setInputFiles({name:"overlap.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...fixture,nodes:fixture.nodes.map(n=>n.id==="flag"?{...n,x:32.5,y:35}:n)}))});
  const nodes=page.locator(".pg-node");await nodes.nth(0).click();await nodes.nth(1).click({modifiers:["Shift"]});await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(2);
  // An unselected object between group members stays clickable above the transparent surface.
  await nodes.nth(2).click();await expect(nodes.nth(2)).toHaveAttribute("aria-pressed","true");await expect(page.locator(".pg-node[aria-pressed=true]")).toHaveCount(1);
});
