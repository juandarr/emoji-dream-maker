import {expect,test,type Page} from "@playwright/test";
async function open(page:Page){
  await page.route("**/api/generations",r=>r.fulfill({json:{configured:true,models:["test/text"]}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();
  await page.getByLabel("Search emojis in English or Spanish").fill("octopus");
}
test("picker stays open for repeated click additions and mouse drops, then dismisses by outside click",async({page})=>{
  await open(page);const picker=page.getByRole("dialog",{name:"Emoji library",exact:true}),add=page.getByRole("button",{name:"Add octopus",exact:true});
  for(let i=1;i<=2;i++){await add.click();await expect(page.locator(".pg-node")).toHaveCount(i);await expect(picker).toBeVisible();await expect(page.getByLabel("Search emojis in English or Spanish")).toHaveValue("octopus");}
  const tray=await add.boundingBox(),canvas=await page.locator(".pg-board").boundingBox();
  const target={x:canvas!.x+canvas!.width*.8,y:canvas!.y+canvas!.height*.7};
  await page.mouse.move(tray!.x+tray!.width/2,tray!.y+tray!.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:16});await expect(page.locator(".pg-drag-glyph")).toBeVisible();await page.mouse.up();
  await expect(page.locator(".pg-node")).toHaveCount(3);await expect(picker).toBeVisible();await expect(picker).toHaveCSS("opacity","1");
  await page.mouse.click(canvas!.x+canvas!.width-20,canvas!.y+20);await expect(picker).toHaveCount(0);
  await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();await expect(page.getByLabel("Search emojis in English or Spanish")).toHaveValue("octopus");
  await page.getByRole("button",{name:"Close emoji picker",exact:true}).click();await expect(picker).toHaveCount(0);await expect(page.getByRole("button",{name:"Open emoji picker",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();await page.keyboard.press("Escape");await expect(picker).toHaveCount(0);await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
});
test("outside dismissal allows the clicked field to keep focus, and Escape works outside the picker",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Exit fullscreen",exact:true}).click();
  await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();await page.getByLabel("Scene title",{exact:true}).click();await expect(page.getByRole("dialog",{name:"Emoji library",exact:true})).toHaveCount(0);await expect(page.getByLabel("Scene title",{exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();await page.getByLabel("Scene title",{exact:true}).focus();await page.keyboard.press("Escape");await expect(page.getByRole("dialog",{name:"Emoji library",exact:true})).toHaveCount(0);
});
test("phone picker stays open after touch additions and a long-press drop",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try{
    await page.addInitScript(()=>Object.defineProperty(Element.prototype,"requestFullscreen",{value:undefined}));await open(page);
    const picker=page.getByRole("dialog",{name:"Emoji library",exact:true}),add=page.getByRole("button",{name:"Add octopus",exact:true});await add.tap();await expect(picker).toBeVisible();await add.tap();await expect(page.locator(".pg-node")).toHaveCount(2);
    const tray=await add.boundingBox(),canvas=await page.locator(".pg-board").boundingBox(),cdp=await context.newCDPSession(page),start={x:tray!.x+tray!.width/2,y:tray!.y+tray!.height/2},end={x:canvas!.x+canvas!.width-20,y:canvas!.y+canvas!.height*.7};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[start]});await page.waitForTimeout(250);await expect(page.locator(".pg-drag-glyph")).toBeVisible();
    for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect(page.locator(".pg-node")).toHaveCount(3);await expect(picker).toBeVisible();await expect(picker).toHaveCSS("opacity","1");
    await page.touchscreen.tap(canvas!.x+canvas!.width-10,canvas!.y+15);await expect(picker).toHaveCount(0);
  }finally{await context.close();}
});

test("Escape cancels a tray drag and closes the picker without leaving a ghost or adding an emoji",async({page})=>{
  await open(page);const tray=await page.getByRole("button",{name:"Add octopus",exact:true}).boundingBox(),canvas=await page.locator(".pg-board").boundingBox();
  await page.mouse.move(tray!.x+tray!.width/2,tray!.y+tray!.height/2);await page.mouse.down();await page.mouse.move(canvas!.x+canvas!.width*.8,canvas!.y+canvas!.height*.7,{steps:15});await expect(page.locator(".pg-drag-glyph")).toBeVisible();
  await page.keyboard.press("Escape");await page.mouse.up();await expect(page.locator(".pg-drag-glyph")).toHaveCount(0);await expect(page.locator(".pg-node")).toHaveCount(0);await expect(page.getByRole("dialog",{name:"Emoji library",exact:true})).toHaveCount(0);await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
});
