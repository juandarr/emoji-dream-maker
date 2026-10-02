import { expect, test, type Page } from "@playwright/test";
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
async function add(page:Page,query:string,label:string) {await page.getByRole("textbox",{name:"Search emojis in English or Spanish"}).fill(query);await page.getByRole("button",{name:`Add ${label}`,exact:true}).click();}
test("board authoring, independent meanings, relationships, undo and reload",async({page})=>{
  await open(page);await expect(page.locator(".pg-board")).toHaveCSS("background-color","rgb(255, 255, 255)");
  await add(page,"red heart","red heart");await page.getByRole("button",{name:"Duplicate",exact:true}).click();
  await page.getByLabel("Chosen meaning",{exact:true}).fill("Human heart");await page.getByLabel("Chosen meaning",{exact:true}).press("Tab");
  const nodes=page.locator(".pg-node");await expect(nodes).toHaveCount(2);await expect(nodes.nth(0)).toHaveAttribute("aria-label",/Love/);await expect(nodes.nth(1)).toHaveAttribute("aria-label",/Human heart/);
  await expect(nodes.nth(1)).toHaveText("❤️");await expect(nodes.nth(1)).toHaveCSS("background-color","rgba(0, 0, 0, 0)");await expect(nodes.nth(1)).toHaveCSS("border-top-width","0px");
  await page.getByLabel("Connect to",{exact:true}).selectOption({index:1});await page.getByLabel("Relationship label",{exact:true}).fill("contrasts with");await page.getByRole("button",{name:"Connect",exact:true}).click();
  await expect(page.getByLabel("Editable interpretation",{exact:true})).toHaveValue(/Human heart → contrasts with → Love/);
  await nodes.nth(1).focus();await nodes.nth(1).press("ArrowRight");const moved=await nodes.nth(1).getAttribute("style");
  await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await nodes.nth(1).getAttribute("style")).not.toEqual(moved);
  await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await nodes.nth(1).getAttribute("style")).toEqual(moved);
  await expect(page.getByText("Saved on this device",{exact:true})).toBeVisible();await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(nodes).toHaveCount(2);await expect(nodes.nth(1)).toHaveAttribute("aria-label",/Human heart/);await expect(page.locator(".pg-relationships")).toContainText("contrasts with");
});
test("drag addition and moving are one undo step at scrolled page positions",async({page})=>{
  await open(page);await page.getByLabel("Search emojis in English or Spanish").fill("octopus");
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
  await page.getByLabel("Busca emojis en inglés o español").fill("pulpo");await page.getByRole("button",{name:"Añadir pulpo",exact:true}).click();await expect(page.locator(".pg-node")).toHaveAttribute("aria-label",/Octopoda/);
  await page.getByLabel("Ordenar emojis").selectOption("alphabetical");await page.getByLabel("Categoría",{exact:true}).selectOption("3");await expect(page.locator(".pg-palette-emoji")).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"/tmp/playground-phone.png",fullPage:true});
});

test("Discover transfers the selected variant and board JSON round trips",async({page})=>{
  await open(page);await page.route("**/api/discover",route=>route.fulfill({json:{status:"empty",items:[]}}));
  await page.getByRole("button",{name:"Discover",exact:true}).click();await page.getByRole("textbox",{name:/Search a word/}).fill("waving hand");
  const emoji=page.getByLabel("waving hand",{exact:true});await emoji.focus();await emoji.press("Enter");await page.getByLabel("Choose a variant").selectOption("👋🏽");
  await page.getByRole("button",{name:"Add to playground",exact:true}).click();await expect(page.locator(".pg-node")).toContainText("👋🏽");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export board",exact:true}).click();const file=await download;await file.saveAs("/tmp/playground-roundtrip.json");
  await page.getByRole("button",{name:"Clear board",exact:true}).click();await expect(page.locator(".pg-node")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles("/tmp/playground-roundtrip.json");await expect(page.locator(".pg-node")).toContainText("👋🏽");
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
