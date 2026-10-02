import { expect, test, type Page } from "@playwright/test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const enData=JSON.parse(readFileSync(createRequire(import.meta.url).resolve("emojibase-data/en/compact.json"),"utf8")) as {group?:number;unicode:string;skins?:{unicode:string}[]}[];
test("same-origin browser generation requests reach input validation",async({page})=>{
  await page.goto("/");
  const result=await page.evaluate(async()=>{
    const response=await fetch("/api/generations",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    return {status:response.status,body:await response.json()};
  });
  expect(result.status).toBe(400);
  expect(result.body.code).toBe("validation");
});
async function open(page:Page) {
  await page.route("**/api/generations",route=>route.request().method()==="GET"?route.fulfill({json:{configured:true,models:["test/text"],maxOutputTokens:800}}):route.fulfill({json:{result:{text:"Moonlight over a quiet ocean.",model:"test/text",provider:"openrouter",usage:{promptTokens:45,completionTokens:10}}}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-board")).toBeVisible();
}
async function picker(page:Page) {if(!await page.getByRole("textbox",{name:"Search emojis in English or Spanish"}).isVisible())await page.getByRole("button",{name:"Open emoji picker",exact:true}).click();}
async function add(page:Page,query:string,label:string) {await picker(page);await page.getByRole("textbox",{name:"Search emojis in English or Spanish"}).fill(query);await page.getByRole("button",{name:`Add ${label}`,exact:true}).click();await page.locator(".pg-node").last().click();}
test("board authoring, independent meanings, relationships, undo and reload",async({page})=>{
  await open(page);await expect(page.locator(".pg-board")).toHaveCSS("background-color","rgb(255, 255, 255)");
  await add(page,"red heart","red heart");await page.getByRole("button",{name:"Duplicate",exact:true}).click();
  await page.getByLabel("Chosen meaning",{exact:true}).fill("Human heart");await page.getByLabel("Chosen meaning",{exact:true}).press("Tab");
  const nodes=page.locator(".pg-node");await expect(nodes).toHaveCount(2);await expect(nodes.nth(0)).toHaveAttribute("aria-label",/Love/);await expect(nodes.nth(1)).toHaveAttribute("aria-label",/Human heart/);
  await expect(nodes.nth(1)).toHaveAttribute("data-glyph","❤️");await expect(nodes.nth(1).locator(".pg-vector-glyph")).toHaveText("❤️");await expect(nodes.nth(1)).toHaveCSS("background-color","rgba(0, 0, 0, 0)");await expect(nodes.nth(1)).toHaveCSS("border-top-width","0px");
  await page.getByLabel("Connect to",{exact:true}).selectOption({index:1});await page.getByLabel("Relationship label",{exact:true}).fill("contrasts with");await page.getByRole("button",{name:"Connect",exact:true}).click();
  await expect(page.getByLabel("Editable interpretation",{exact:true})).toHaveValue(/Human heart → contrasts with → Love/);
  await nodes.nth(1).focus();await nodes.nth(1).press("ArrowRight");const moved=await nodes.nth(1).getAttribute("style");
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await nodes.nth(1).getAttribute("style")).not.toEqual(moved);
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await nodes.nth(1).getAttribute("style")).toEqual(moved);
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(nodes).toHaveCount(2);await expect(nodes.nth(1)).toHaveAttribute("aria-label",/Human heart/);await expect(page.locator(".pg-relationships")).toContainText("contrasts with");
});
test("drag addition and moving are one undo step at scrolled page positions",async({page})=>{
  await open(page);await picker(page);await page.getByLabel("Search emojis in English or Spanish").fill("octopus");
  const tray=page.getByRole("button",{name:"Add octopus",exact:true});const canvas=page.locator(".pg-board");await canvas.scrollIntoViewIfNeeded();
  const start=await tray.boundingBox(),dest=await canvas.boundingBox();
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();await page.mouse.move(start!.x+start!.width/2+10,start!.y+start!.height/2,{steps:3});await page.mouse.move(dest!.x+dest!.width*.7,dest!.y+dest!.height*.6,{steps:15});await expect(page.locator(".pg-palette-emoji.dragging>span")).toHaveCSS("visibility","hidden");await page.mouse.up();
  const node=page.locator(".pg-node");await expect(node).toHaveCount(1);const old=await node.getAttribute("style");
  const box=await node.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2-60,box!.y+box!.height/2-40,{steps:10});
  await expect(node).toHaveCSS("opacity","1");await expect(node).toHaveCSS("cursor","grabbing");await expect(page.locator(".pg-drag-glyph")).toHaveCount(0);await expect(node).not.toHaveAttribute("style",old!);
  await page.mouse.up();expect(await node.getAttribute("style")).not.toEqual(old);
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await node.getAttribute("style")).toEqual(old);
});
test("generation uses editable input, keeps results through tab changes and marks stale meanings",async({page})=>{
  await open(page);await add(page,"moon","crescent moon");
  await page.getByLabel("Editable interpretation",{exact:true}).fill("A moonlit ocean with a calm mood.");
  await page.getByLabel("Reasoning effort",{exact:true}).selectOption("high");
  const submission=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");
  await page.getByRole("button",{name:"Generate",exact:true}).click();expect((await submission).postDataJSON().settings.reasoningEffort).toBe("high");
  await expect(page.locator(".pg-generation-status")).toContainText("Creation ready.");
  await expect(page.getByLabel("Edit output",{exact:true})).toHaveValue("Moonlight over a quiet ocean.");
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"/tmp/playground-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Favorites",exact:false}).click();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.getByLabel("Edit output",{exact:true})).toBeVisible();
  await page.getByLabel("Chosen meaning",{exact:true}).fill("Nighttime");await page.getByLabel("Chosen meaning",{exact:true}).press("Tab");await expect(page.getByText("This creation uses an earlier version of your ideas.")).toBeVisible();
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.getByLabel("Edit output",{exact:true})).toHaveValue("Moonlight over a quiet ocean.");
});
test("connection and provider failures preserve the authored board",async({page})=>{
  await open(page);await add(page,"ocean","water wave");
  await page.route("**/api/generations",route=>route.request().method()==="GET"?route.fulfill({json:{configured:false,models:["test/text"],maxOutputTokens:800}}):route.fulfill({status:502,json:{error:"OpenRouter needs credits.",code:"provider"}}));
  await page.getByRole("button",{name:"Generate",exact:true}).click();await expect(page.locator(".pg-generation-status")).toContainText("OpenRouter needs credits.");await expect(page.locator(".pg-node")).toHaveCount(1);
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.getByRole("button",{name:"Generate",exact:true})).toBeDisabled();await expect(page.getByText(/To connect OpenRouter/)).toBeVisible();await expect(page.locator(".pg-node")).toHaveCount(1);
});
test("phone tap flow and Spanish meanings have no horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);await page.getByLabel("Interface language").selectOption("es");
  await page.getByRole("button",{name:"Abrir selector de emojis",exact:true}).click();await page.getByLabel("Busca emojis en inglés o español").fill("pulpo");await page.getByRole("button",{name:"Añadir pulpo",exact:true}).click();await expect(page.locator(".pg-node")).toHaveAttribute("aria-label",/Octopoda/);
  await page.getByRole("button",{name:"Abrir selector de emojis",exact:true}).click();await page.getByLabel("Ordenar emojis").selectOption("alphabetical");await page.getByLabel("Categoría",{exact:true}).selectOption("3");await expect(page.locator(".pg-palette-emoji")).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"/tmp/playground-phone.png",fullPage:true});
});

test("Discover transfers the selected variant and board JSON round trips",async({page})=>{
  await open(page);await page.route("**/api/discover",route=>route.fulfill({json:{status:"empty",items:[]}}));
  await page.getByRole("button",{name:"Discover",exact:true}).click();await page.getByRole("textbox",{name:/Search a word/}).fill("waving hand");
  const emoji=page.getByLabel("waving hand",{exact:true});await emoji.focus();await emoji.press("Enter");await page.getByLabel("Choose a variant").selectOption("👋🏽");
  await page.getByRole("button",{name:"Add to playground",exact:true}).click();await expect(page.locator(".pg-node")).toHaveAttribute("data-glyph","👋🏽");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export board",exact:true}).click();const file=await download;await file.saveAs("/tmp/playground-roundtrip.json");
  await page.getByRole("button",{name:"Clear board",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles("/tmp/playground-roundtrip.json");await expect(page.locator(".pg-node")).toHaveAttribute("data-glyph","👋🏽");
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(0);
});

test("a delayed generation completes while another tab is active",async({page})=>{
  await open(page);await add(page,"ocean","water wave");
  let complete:()=>void=()=>{};const release=new Promise<void>(resolve=>{complete=resolve;});
  await page.route("**/api/generations",async route=>{if(route.request().method()==="GET")return route.fallback();await release;await route.fulfill({json:{result:{text:"An ocean poem",model:"test/text",provider:"openrouter"}}});});
  await page.getByRole("button",{name:"Generate",exact:true}).click();await expect(page.getByRole("button",{name:"Creating…",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Favorites",exact:false}).click();complete();
  await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.getByLabel("Edit output",{exact:true})).toHaveValue("An ocean poem");
});

test("storage failure still allows authoring and corrupt imports keep the board",async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,"indexedDB",{get:()=>{throw new Error("Unavailable");}});});
  await open(page);await expect(page.getByText(/Your saved board could not be opened/).first()).toBeVisible();
  await page.getByRole("button",{name:"Start fresh",exact:true}).click();await add(page,"red heart","red heart");
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();await expect(page.getByRole("button",{name:"Export board",exact:true})).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({name:"broken.json",mimeType:"application/json",buffer:Buffer.from('{"schemaVersion":99}')});await expect(page.getByText(/Could not import this board/)).toBeVisible();await expect(page.locator(".pg-node")).toHaveCount(1);
});

test("object clicks toggle selection; dragging stays unselected and deletes undo cleanly",async({page})=>{
  await open(page);await picker(page);await page.getByLabel("Search emojis in English or Spanish").fill("octopus");await page.getByRole("button",{name:"Add octopus",exact:true}).click();
  const node=page.locator(".pg-node");await expect(node).toHaveAttribute("aria-pressed","false");
  await node.click();await expect(node).toHaveAttribute("aria-pressed","true");await expect(page.getByRole("button",{name:"Delete selected object"})).toBeVisible();
  await expect(node.locator(":scope > span")).toHaveCSS("animation-name","pg-object-float");
  await node.click();await expect(node).toHaveAttribute("aria-pressed","false");
  await node.click();await page.keyboard.press("Escape");await expect(node).toHaveAttribute("aria-pressed","false");
  await node.click();await page.locator(".pg-board").click({position:{x:15,y:15}});await expect(node).toHaveAttribute("aria-pressed","false");await expect(page.getByRole("button",{name:"Delete selected object"})).toHaveCount(0);
  // Keyboard focus remains functional without the dashed oval or button outline.
  await page.keyboard.press("Tab");await node.focus();expect(await node.evaluate(el=>el.matches(":focus-visible"))).toBe(true);
  await expect(node).toHaveCSS("outline-style","none");await expect(node.locator(":scope > span")).toHaveCSS("outline-style","none");
  await page.keyboard.press("Enter");await expect(node).toHaveAttribute("aria-pressed","true");await page.keyboard.press("Space");await expect(node).toHaveAttribute("aria-pressed","false");
  const before=await node.getAttribute("style"),box=await node.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+100,box!.y+box!.height/2+80,{steps:8});
  await expect(node).toHaveClass(/dragging/);await expect(node.locator(":scope > span")).toHaveCSS("animation-name","none");await expect(node).toHaveAttribute("aria-pressed","false");await expect(page.locator(".pg-drag-glyph")).toHaveCount(0);
  await page.mouse.up();await expect(node).toHaveAttribute("aria-pressed","false");await expect(node).not.toHaveClass(/dragging/);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(node).toHaveAttribute("style",before!);
  await node.click();await page.getByRole("button",{name:"Delete selected object"}).click();await expect(node).toHaveCount(0);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(node).toHaveCount(1);
  await node.click();await page.keyboard.press("Backspace");await expect(node).toHaveCount(0);
});

test("wheel zoom anchors under the cursor, pans freely, and never scrolls the page",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await open(page);await add(page,"octopus","octopus");const node=page.locator(".pg-node"),canvas=page.locator(".pg-board");await page.keyboard.press("Escape");await canvas.scrollIntoViewIfNeeded();
  const before=await node.boundingBox(),center={x:before!.x+before!.width/2,y:before!.y+before!.height/2};
  const scroll=await page.evaluate(()=>scrollY);await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-400);await expect(page.getByLabel("Canvas zoom")).not.toHaveText("100%");
  const after=await node.boundingBox();expect(after!.width).toBeGreaterThan(before!.width*2);expect(Math.abs(after!.x+after!.width/2-center.x)).toBeLessThan(2);expect(Math.abs(after!.y+after!.height/2-center.y)).toBeLessThan(2);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
  const rect=await canvas.boundingBox();const start={x:rect!.x+rect!.width-40,y:rect!.y+rect!.height-50};
  await node.click();await expect(node).toHaveAttribute("aria-pressed","true");
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x-130,start.y-90,{steps:8});await page.mouse.up();await expect(node).toHaveAttribute("aria-pressed","true");
  const panned=await node.boundingBox();expect(panned!.x-after!.x).toBeCloseTo(-130,0);expect(panned!.y-after!.y).toBeCloseTo(-90,0);
  await page.mouse.move(start.x-130,start.y-90);await page.mouse.down();await page.mouse.move(start.x,start.y,{steps:8});await page.mouse.up();
  const restored=await node.boundingBox();expect(restored!.x).toBeCloseTo(after!.x,0);expect(restored!.y).toBeCloseTo(after!.y,0);
  await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,500);await expect(page.getByLabel("Canvas zoom")).toHaveText(/82%/);
  await page.getByRole("button",{name:"Fit objects in view"}).click();await expect(node).toBeInViewport();
});

test("fullscreen keeps the floating picker, scaled dragging, and screen-sized zoom limit",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen"}).click();
  await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains("pg-stage"))).toBe(true);
  await picker(page);await expect(page.getByRole("dialog",{name:"Emoji library",exact:true})).toBeVisible();await page.getByLabel("Search emojis in English or Spanish").fill("octopus");await page.getByRole("button",{name:"Add octopus",exact:true}).click();
  const node=page.locator(".pg-node");await expect(node).toHaveAttribute("aria-pressed","false");await expect(node).toBeInViewport();
  const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox();await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);await page.mouse.wheel(0,-20000);
  const zoom=Number((await page.getByLabel("Canvas zoom").textContent())!.replace("%",""))/100;
  expect(zoom*40).toBeCloseTo(Math.min(rect!.width,rect!.height),-1);await expect(page.getByRole("button",{name:"Zoom in",exact:true})).toBeDisabled();
  await page.mouse.wheel(0,20000);await expect(page.getByLabel("Canvas zoom")).toHaveText("10%");
  await page.getByRole("button",{name:"Fit objects in view"}).click();await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  const before=await node.boundingBox();await page.mouse.move(before!.x+before!.width/2,before!.y+before!.height/2);await page.mouse.down();await page.mouse.move(before!.x+before!.width/2+90,before!.y+before!.height/2+50,{steps:8});await page.mouse.up();
  const after=await node.boundingBox();expect(after!.x-before!.x).toBeCloseTo(90,0);expect(after!.y-before!.y).toBeCloseTo(50,0);await expect(node).toHaveAttribute("aria-pressed","false");
  await page.getByRole("button",{name:"Exit fullscreen"}).click();await expect(page.locator(".pg-stage")).not.toHaveClass(/is-fullscreen/);await expect(node).toHaveCount(1);
  await page.getByRole("button",{name:"Fit objects in view"}).click();await expect(node).toBeInViewport();
});

test("floating picker drag uses zoomed and panned world coordinates and saves off-board positions",async({page})=>{
  await open(page);await page.getByRole("button",{name:"Enter fullscreen"}).click();
  const canvas=page.locator(".pg-board"),rect=await canvas.boundingBox();
  await page.mouse.move(rect!.x+rect!.width*.6,rect!.y+rect!.height*.5);await page.mouse.down();await page.mouse.move(rect!.x+rect!.width*.6+600,rect!.y+rect!.height*.5+300,{steps:8});await page.mouse.up();
  await page.mouse.move(rect!.x+rect!.width*.8,rect!.y+rect!.height*.6);await page.mouse.wheel(0,-350);await expect(page.getByLabel("Canvas zoom")).not.toHaveText("100%");
  await picker(page);await page.getByLabel("Search emojis in English or Spanish").fill("octopus");
  const tray=await page.getByRole("button",{name:"Add octopus",exact:true}).boundingBox();const dest={x:rect!.x+rect!.width*.8,y:rect!.y+rect!.height*.7};
  await page.mouse.move(tray!.x+tray!.width/2,tray!.y+tray!.height/2);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:20});await expect(page.locator(".pg-drag-glyph")).toBeVisible();await page.mouse.up();
  const node=page.locator(".pg-node");await expect(node).toHaveCount(1);await expect(node).toHaveAttribute("aria-pressed","false");
  const box=await node.boundingBox();expect(Math.abs(box!.x+box!.width/2-dest.x)).toBeLessThan(2);expect(Math.abs(box!.y+box!.height/2-dest.y)).toBeLessThan(2);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(node).toHaveCount(0);await page.getByRole("button",{name:"Redo",exact:true}).click();await expect(node).toHaveCount(1);
  // Add in the current view after a much larger pan, beyond the original 0–100 rectangle.
  await page.mouse.move(rect!.x+400,rect!.y+200);await page.mouse.down();await page.mouse.move(rect!.x+1100,rect!.y+200,{steps:8});await page.mouse.up();
  await picker(page);await page.getByRole("button",{name:"Add octopus",exact:true}).click();await expect(node).toHaveCount(2);
  const position=await node.last().evaluate(el=>({left:(el as HTMLElement).style.left,top:(el as HTMLElement).style.top}));expect(parseFloat(position.left)).toBeLessThan(0);
  await page.getByRole("button",{name:"Exit fullscreen"}).click();await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(node).toHaveCount(2);expect(await node.last().evaluate(el=>({left:(el as HTMLElement).style.left,top:(el as HTMLElement).style.top}))).toEqual(position);
  await page.getByRole("button",{name:"Fit objects in view"}).click();await expect(node.first()).toBeInViewport();await expect(node.last()).toBeInViewport();
});

test("phone fullscreen fallback, picker scroll, reduced motion and focus stay usable",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:"reduce"});
  await page.addInitScript(()=>{Object.defineProperty(Element.prototype,"requestFullscreen",{value:undefined});});
  await open(page);await page.getByRole("button",{name:"Enter fullscreen"}).click();await expect(page.locator(".pg-stage")).toHaveClass(/is-fullscreen/);
  await picker(page);await expect(page.getByLabel("Search emojis in English or Spanish")).toBeFocused();await page.getByLabel("Search emojis in English or Spanish").fill("octopus");await page.getByRole("button",{name:"Add octopus",exact:true}).click();
  await expect(page.getByRole("button",{name:"Open emoji picker"})).toBeFocused();
  const node=page.locator(".pg-node");await node.click();await expect(node.locator(":scope > span")).toHaveCSS("animation-name","none");await expect(page.getByRole("button",{name:"Delete selected object"})).toBeVisible();
  await page.screenshot({path:"/tmp/canvas-phone-fullscreen.png"});
  await picker(page);await page.getByLabel("Search emojis in English or Spanish").fill("");
  const world=await page.locator(".pg-world").getAttribute("style"),palette=page.locator(".pg-palette");await palette.hover();await page.mouse.wheel(0,400);await expect(page.locator(".pg-world")).toHaveAttribute("style",world!);
  await page.screenshot({path:"/tmp/canvas-phone-picker.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog",{name:"Emoji library",exact:true})).toHaveCount(0);await expect(node).toHaveAttribute("aria-pressed","false");await expect(page.getByRole("button",{name:"Open emoji picker"})).toBeFocused();
  await page.keyboard.press("Escape");await expect(page.locator(".pg-stage")).not.toHaveClass(/is-fullscreen/);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
});

test("touch can scroll the picker, tap to select and drag the original object",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  try {
    await open(page);await picker(page);const palette=page.locator(".pg-palette"),box=await palette.boundingBox();
    const cdp=await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box!.x+30,y:box!.y+box!.height-25}]});
    for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:box!.x+30,y:box!.y+box!.height-25-i*15}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>palette.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await page.getByLabel("Search emojis in English or Spanish").fill("octopus");await page.getByRole("button",{name:"Add octopus",exact:true}).tap();
    const node=page.locator(".pg-node");await expect(node).toHaveAttribute("aria-pressed","false");await node.tap();await expect(node).toHaveAttribute("aria-pressed","true");
    const before=await node.boundingBox(),point={x:before!.x+before!.width/2,y:before!.y+before!.height/2};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
    for(let i=1;i<=6;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x+10*i,y:point.y+5*i}]});
    await expect(node).toHaveClass(/dragging/);await expect(page.locator(".pg-drag-glyph")).toHaveCount(0);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(node).toHaveAttribute("aria-pressed","true");
    const after=await node.boundingBox();expect(after!.x-before!.x).toBeCloseTo(60,0);expect(after!.y-before!.y).toBeCloseTo(30,0);
    await picker(page);const tray=await page.getByRole("button",{name:"Add octopus",exact:true}).boundingBox(),canvas=await page.locator(".pg-board").boundingBox();
    const drop={x:canvas!.x+canvas!.width-12,y:canvas!.y+canvas!.height*.6};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:tray!.x+tray!.width/2,y:tray!.y+tray!.height/2}]});
    await page.waitForTimeout(250); // Deliberate long-press activation, not a render wait.
    await expect(page.locator(".pg-drag-glyph")).toBeVisible();
    for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:tray!.x+tray!.width/2+(drop.x-tray!.x-tray!.width/2)*i/12,y:tray!.y+tray!.height/2+(drop.y-tray!.y-tray!.height/2)*i/12}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(node).toHaveCount(2);await expect(node.last()).toHaveAttribute("aria-pressed","false");

  } finally {await context.close();}
});

test("emoji vectors render at display resolution through maximum zoom",async({browser})=>{
  for(const deviceScaleFactor of [1,2]) {
    const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor});const page=await context.newPage();
    try {
      await open(page);await add(page,"octopus","octopus");await page.keyboard.press("Escape");await page.getByRole("button",{name:"Enter fullscreen"}).click();
      await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
      await page.getByRole("button",{name:"Fit objects in view"}).click();
      const artwork=page.locator(".pg-node .pg-artwork");await expect(artwork).toHaveText("🐙");
      await page.evaluate(async()=>{await document.fonts.load('40px "Playground Noto Emoji"');await document.fonts.ready;});
      const cdp=await context.newCDPSession(page);await cdp.send("DOM.enable");await cdp.send("CSS.enable");
      const {root}=await cdp.send("DOM.getDocument");
      const {nodeId}=await cdp.send("DOM.querySelector",{nodeId:root.nodeId,selector:".pg-node .pg-vector-glyph"});
      const {fonts}=await cdp.send("CSS.getPlatformFontsForNode",{nodeId});
      expect(fonts).toEqual([expect.objectContaining({familyName:"Noto Color Emoji",isCustomFont:true,glyphCount:1})]);
      const rect=await page.locator(".pg-board").boundingBox();await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);await page.mouse.wheel(0,-20000);await expect(page.getByRole("button",{name:"Zoom in",exact:true})).toBeDisabled();
      const metrics=await artwork.evaluate(el=>{const rect=el.getBoundingClientRect();const world=document.querySelector(".pg-world")!;const transform=new DOMMatrixReadOnly(getComputedStyle(world).transform);return {width:rect.width,height:rect.height,fontSize:parseFloat(getComputedStyle(el.parentElement!).fontSize),scaleX:transform.a,scaleY:transform.d,willChange:getComputedStyle(world).willChange};});
      expect(metrics.width).toBeCloseTo(Math.min(rect!.width,rect!.height),0);expect(metrics.fontSize).toBeCloseTo(metrics.width,0);expect(metrics.scaleX).toBe(1);expect(metrics.scaleY).toBe(1);expect(metrics.willChange).toBe("auto");
      await page.locator(".pg-board").screenshot({path:`/tmp/vector-emoji-max-zoom-${deviceScaleFactor}x.png`});
      await page.mouse.wheel(0,20000);await expect(page.getByLabel("Canvas zoom")).toHaveText("10%");await expect(artwork).toHaveText("🐙");
      await page.getByRole("button",{name:"Fit objects in view"}).click();await page.locator(".pg-node").click();await expect(page.getByRole("button",{name:"Delete selected object"})).toBeVisible();
    }finally{await context.close();}
  }
});


test("Noto vectors shape the whole catalog including flags, ZWJ and skin tones",async({page,context})=>{
  await open(page);await add(page,"octopus","octopus");
  const glyphs=enData.filter(e=>e.group!==undefined&&e.group!==2).flatMap(e=>[e.unicode,...(e.skins||[]).map(v=>v.unicode)]);
  await page.evaluate(async glyphs=>{
    await document.fonts.load('40px "Playground Noto Emoji"');await document.fonts.ready;
    const sample=document.createElement("div");sample.id="font-coverage";
    sample.style.cssText='font-family:"Playground Noto Emoji","Noto Color Emoji",sans-serif;font-size:40px;white-space:pre;position:absolute;top:0;left:0;opacity:0;pointer-events:none';
    sample.textContent=glyphs.join(" ");document.body.append(sample);
  },glyphs);
  const cdp=await context.newCDPSession(page);await cdp.send("DOM.enable");await cdp.send("CSS.enable");
  const {root}=await cdp.send("DOM.getDocument");const {nodeId}=await cdp.send("DOM.querySelector",{nodeId:root.nodeId,selector:"#font-coverage"});
  const {fonts}=await cdp.send("CSS.getPlatformFontsForNode",{nodeId});
  expect(fonts).toEqual([expect.objectContaining({familyName:"Noto Color Emoji",isCustomFont:true})]);
  expect(fonts[0].glyphCount).toBe(glyphs.length*2-1);
});
