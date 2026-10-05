import {expect,test,type Page} from "@playwright/test";
const board={schemaVersion:1,title:"",intent:"",interpretation:"",edges:[],nodes:[{id:"bear",emojiId:"1F9F8",glyph:"🧸",label:"Teddy bear",meaning:"A traveler",note:"",role:"subject",x:45,y:45,scale:1,rotation:0},{id:"moon",emojiId:"1F319",glyph:"🌙",label:"Moon",meaning:"An unfamiliar world",note:"",role:"setting",x:65,y:30,scale:1,rotation:0}]};
async function open(page:Page,pending=false){
  let count=0;
  let resolve!:()=>void;
  const gate=new Promise<void>(r=>resolve=r);
  await page.route("**/api/generations",async route=>{
    if(route.request().method()==="GET")return route.fulfill({json:{configured:true,models:["test/text","test/other"],maxOutputTokens:8192}});
    count++;const title=`Creation ${count}`;
    if(pending)await gate;
    await route.fulfill({json:{result:{title,text:`A traveler finds wonder beneath the moon. Chapter ${count}.`,model:"test/text",provider:"openrouter"}}});
  });
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-board")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({name:"scene.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(board))});await expect(page.locator(".pg-node")).toHaveCount(2);
  return resolve;
}
async function generate(page:Page,count:number){await page.getByRole("button",{name:"Generate",exact:true}).click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText(`Creation ${count}`);await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();}

test("readable options and a live generation summary support hover, focus and dismissal",async({page})=>{
  await page.setViewportSize({width:1600,height:1000});await open(page);
  const optionStyle=await page.getByLabel("Make a",{exact:true}).locator('option[value="poem"]').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity}));
  expect(optionStyle).toEqual({color:"rgb(243, 237, 250)",background:"rgb(36, 32, 45)",opacity:"1"});
  const info=page.getByRole("button",{name:"Generation summary",exact:true}),summary=page.getByRole("tooltip");
  await expect(summary).toBeHidden();await info.hover();await expect(summary).not.toContainText("Before you generate");await expect(summary).toContainText("test/text");await expect(summary).toContainText("Model default");await expect(summary).toContainText("Automatic canvas interpretation");
  await page.getByLabel("Make a",{exact:true}).hover();await expect(summary).toBeHidden();
  await info.focus();await expect(summary).toBeVisible();await info.press("Escape");await expect(summary).toBeHidden();
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await page.getByLabel("Scene title",{exact:true}).fill("The moon’s invitation");await page.getByLabel("What do you want to express?",{exact:true}).fill("Finding courage.");
  await page.locator(".pg-brief-options summary").click();await page.getByLabel("Editable interpretation",{exact:true}).fill("A journey toward the unknown.");
  await page.locator(".pg-node").first().click();await page.getByLabel("Connect to",{exact:true}).selectOption("moon");await page.getByLabel("Relationship label",{exact:true}).fill("dreams of");await page.getByRole("button",{name:"Connect",exact:true}).click();
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Text model",{exact:true}).selectOption("test/other");await page.getByLabel("Reasoning effort",{exact:true}).selectOption("high");
  await info.click();await expect(summary).toContainText("test/other");await expect(summary).toContainText("High");await expect(summary).toContainText("The moon’s invitation");await expect(summary).toContainText("Finding courage.");await expect(summary).toContainText("Canvas interpretation edited");await expect(summary).toContainText("dreams of");
  await page.getByLabel("Make a",{exact:true}).click();await expect(summary).toBeHidden();
});

test("summary fits a phone, opens on tap, and follows the UI language",async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole("button",{name:"Generation summary",exact:true}).click();const summary=page.getByRole("tooltip");await expect(summary).toBeVisible();
  const rect=await summary.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(390);
  await page.getByLabel("Interface language").selectOption("es");await expect(page.getByRole("button",{name:"Resumen de generación",exact:true})).toBeVisible();await expect(summary).not.toContainText("Antes de generar");await expect(summary).toContainText("Predeterminado del modelo");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("reset restores 100% zoom and clears the current output across reloads, preserving history",async({page})=>{
  await open(page);await generate(page,1);await page.getByRole("button",{name:"Zoom in",exact:true}).click();await expect(page.getByLabel("Canvas zoom",{exact:true})).not.toHaveText("100%");
  await page.getByRole("button",{name:"Reset canvas",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(0);await expect(page.getByLabel("Canvas zoom",{exact:true})).toHaveText("100%");await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.locator(".pg-history-card")).toHaveCount(1);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(2);await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);
  await page.getByRole("button",{name:"Enter fullscreen",exact:true}).click();await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.getByRole("button",{name:"Reset canvas",exact:true}).click();await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);await expect(page.getByLabel("Canvas zoom",{exact:true})).toHaveText("100%");await page.getByRole("button",{name:"Exit fullscreen",exact:true}).click();
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.locator(".pg-history-card")).toHaveCount(1);
  await page.getByRole("button",{name:"Read creation: Creation 1",exact:true}).click();await expect(page.getByRole("dialog").locator(".pg-story-title")).toHaveText("Creation 1");await page.getByRole("button",{name:"Close reading view",exact:true}).click();
  // Reset is usable even when the canvas has no symbols.
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.getByRole("button",{name:"Reset canvas",exact:true}).click();await expect(page.getByLabel("Canvas zoom",{exact:true})).toHaveText("100%");
});

test("a response arriving after reset stays in the shelf without repopulating the output",async({page})=>{
  const finish=await open(page,true);await page.getByRole("button",{name:"Generate",exact:true}).click();await expect(page.locator(".pg-output .pg-story-pending")).toBeVisible();await page.getByRole("button",{name:"Reset canvas",exact:true}).click();finish();
  await expect(page.locator(".pg-history-card")).toContainText("Creation 1");await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.getByRole("button",{name:"Generate",exact:true})).toBeDisabled();
});

test("history retains 20, starts at five, expands, deletes with Undo, and persists deletion",async({page})=>{
  await open(page);for(let i=1;i<=21;i++)await generate(page,i);
  await expect(page.locator(".pg-shelf-heading")).toContainText("20 / 20");await expect(page.locator(".pg-history-card")).toHaveCount(5);await expect(page.locator(".pg-history-card").first()).toContainText("Creation 21");
  await page.getByRole("button",{name:"Show all (20)",exact:true}).click();await expect(page.locator(".pg-history-card")).toHaveCount(20);await expect(page.getByRole("button",{name:"Read creation: Creation 1",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Show fewer",exact:true}).click();await expect(page.locator(".pg-history-card")).toHaveCount(5);
  await page.getByRole("button",{name:"Delete creation: Creation 21",exact:true}).click();await expect(page.locator(".pg-shelf-heading")).toContainText("19 / 20");await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.getByRole("button",{name:"Delete creation: Creation 20",exact:true})).toBeFocused();
  await page.locator(".pg-history-undo").click();await expect(page.locator(".pg-shelf-heading")).toContainText("20 / 20");await expect(page.locator(".pg-output .pg-story-title")).toHaveText("Creation 21");
  await page.getByRole("button",{name:"Delete creation: Creation 20",exact:true}).click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText("Creation 21");await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-shelf-heading")).toContainText("19 / 20");await expect(page.locator(".pg-history-card")).toHaveCount(5);await expect(page.getByRole("button",{name:"Read creation: Creation 20",exact:true})).toHaveCount(0);
});

test("deleting a pending creation does not resurrect it, and Undo restores the finished response",async({page})=>{
  const finish=await open(page,true);await page.getByRole("button",{name:"Generate",exact:true}).click();await expect(page.locator(".pg-history-card")).toHaveCount(1);await page.getByRole("button",{name:"Delete creation: Interpretation",exact:true}).click();await expect(page.locator(".pg-history-card")).toHaveCount(0);finish();
  await expect(page.getByRole("button",{name:"Generate",exact:true})).toBeEnabled();await expect(page.locator(".pg-history-card")).toHaveCount(0);await page.locator(".pg-history-undo").click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText("Creation 1");await expect(page.locator(".pg-history-card")).toContainText("Chapter 1");
});


test("existing saved workspaces without an active result field retain their latest output",async({page})=>{
  await open(page);await generate(page,1);
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open("dream-maker-playground-v1",1);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction("workspace","readwrite"),store=tx.objectStore("workspace"),read=store.get("active");read.onsuccess=()=>{const saved=read.result;delete saved.activeRunId;store.put(saved,"active");};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);
  }));
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText("Creation 1");await expect(page.locator(".pg-history-card")).toHaveCount(1);
});

test("generation uses the arranged scene; camera changes stay fresh and object transforms make results stale",async({page})=>{
  await open(page);await generate(page,1);
  const stale=page.getByText("This creation uses an earlier version of your ideas.",{exact:true});
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();await expect(stale).toHaveCount(0);
  const canvas=page.locator(".pg-board");await canvas.scrollIntoViewIfNeeded();const rect=await canvas.boundingBox();
  await page.mouse.move(rect!.x+rect!.width-35,rect!.y+rect!.height-35);await page.mouse.down();await page.mouse.move(rect!.x+rect!.width-70,rect!.y+rect!.height-60,{steps:6});await page.mouse.up();await expect(stale).toHaveCount(0);
  const bear=page.locator('.pg-node[data-id="bear"]');await bear.click();await bear.press("ArrowRight");await expect(stale).toBeVisible();
  await page.getByRole("button",{name:"Rotate selection",exact:true}).press("ArrowRight");await page.getByRole("button",{name:"Resize selection",exact:true}).press("ArrowRight");
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await generate(page,2);
  const submitted=(await request).postDataJSON().board.nodes.find((node:{id:string})=>node.id==="bear");expect(submitted.x).toBeCloseTo(47);expect(submitted.y).toBeCloseTo(45);expect(submitted.rotation).toBe(5);expect(submitted.scale).toBeCloseTo(1.1);await expect(stale).toHaveCount(0);
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText("Creation 2");await expect(stale).toHaveCount(0);
});
