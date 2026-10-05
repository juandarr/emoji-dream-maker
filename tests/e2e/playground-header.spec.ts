import {expect,test,type Page} from "@playwright/test";
const board={schemaVersion:1,title:"",intent:"",interpretation:"",edges:[],nodes:[{id:"bear",emojiId:"1F9F8",glyph:"🧸",label:"Teddy bear",meaning:"A curious traveler",note:"",role:"subject",x:45,y:45,scale:1,rotation:0},{id:"moon",emojiId:"1F319",glyph:"🌙",label:"Moon",meaning:"An unfamiliar world",note:"",role:"setting",x:65,y:30,scale:1,rotation:0}]};
async function open(page:Page){
  await page.route("**/api/generations",route=>route.request().method()==="GET"?route.fulfill({json:{configured:true,models:["test/text","test/other"],maxOutputTokens:8192}}):route.fulfill({json:{result:{title:route.request().postDataJSON().settings.locale==="es"?"La invitación de la luna":"The Moon’s Invitation",text:route.request().postDataJSON().settings.locale==="es"?"Estos símbolos sugieren un viaje hacia lo desconocido.":"These symbols suggest a journey into the unknown.",model:"test/text",provider:"openrouter"}}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-board")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({name:"scene.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(board))});await expect(page.locator(".pg-node")).toHaveCount(2);
}
async function centered(page:Page){
  const area=await page.locator(".pg-header-action-area").boundingBox(),button=await page.getByRole("button",{name:"Generate",exact:true}).boundingBox();
  expect(Math.abs(area!.x+area!.width/2-button!.x-button!.width/2)).toBeLessThan(2);
  expect(Math.abs(area!.y+area!.height/2-button!.y-button!.height/2)).toBeLessThan(2);
}

test("header defaults, context expansion and relationships follow the requested hierarchy",async({page})=>{
  await page.setViewportSize({width:1600,height:1000});await open(page);
  await expect(page.getByLabel("Make a",{exact:true})).toHaveValue("interpretation");
  await expect(page.getByLabel("Make a",{exact:true}).locator("option")).toHaveText(["Interpretation","Short message","Poem","Short story","Song lyrics","Image prompt","Video storyboard"]);
  await expect(page.getByLabel("Output language",{exact:true})).toHaveCount(0);await expect(page.getByLabel("Tone",{exact:true})).toHaveCount(0);
  await expect(page.locator("#pg-context")).toBeHidden();await expect(page.locator("#pg-symbol-editor")).toBeHidden();await expect(page.locator("#pg-generation-settings")).toBeHidden();
  await expect(page.locator(".pg-create-column")).toHaveText("Generate");await centered(page);
  expect((await page.locator(".pg-creation-header").boundingBox())!.height).toBeLessThan(235);
  await page.getByRole("button",{name:"Add context",exact:true}).click();
  const meaning=page.locator(".pg-meaning"),main=page.locator(".pg-header-main");
  await expect(meaning.getByLabel("Scene title",{exact:true})).toBeVisible();await expect(meaning).toContainText("Optional");
  expect((await meaning.boundingBox())!.width).toBeCloseTo((await main.boundingBox())!.width,0);await centered(page);
  await page.getByLabel("Scene title",{exact:true}).fill("My own title");await page.getByLabel("What do you want to express?",{exact:true}).fill("Finding courage in an unfamiliar world.");
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.locator("#pg-symbol-editor")).toBeVisible();
  const left=await meaning.boundingBox(),right=await page.locator("#pg-symbol-editor").boundingBox();expect(left!.width).toBeCloseTo(right!.width,0);expect(right!.x).toBeGreaterThan(left!.x+left!.width);await centered(page);
  await page.locator(".pg-node").first().click();await expect(page.getByLabel("Chosen meaning",{exact:true})).toHaveValue("A curious traveler");
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.locator("#pg-symbol-editor")).toBeHidden();expect((await meaning.boundingBox())!.width).toBeCloseTo((await main.boundingBox())!.width,0);
  await page.getByRole("button",{name:"Add context",exact:true}).click();await expect(page.getByLabel("Scene title",{exact:true})).toBeHidden();
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  const payload=(await request).postDataJSON();expect(payload.board.title).toBe("My own title");expect(payload.board.intent).toBe("Finding courage in an unfamiliar world.");
  await expect(page.locator(".pg-output .pg-story-title")).toHaveText("My own title");
});

test("blank titles are generated and retained; language follows the UI immediately",async({page})=>{
  await open(page);await page.getByLabel("Interface language").selectOption("es");
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generar",exact:true}).click();
  expect((await request).postDataJSON()).toMatchObject({board:{title:""},settings:{kind:"interpretation",locale:"es"}});
  await expect(page.locator(".pg-output .pg-story-title")).toHaveText("La invitación de la luna");await expect(page.locator(".pg-output .pg-story-prose")).toHaveText("Estos símbolos sugieren un viaje hacia lo desconocido.");
  await expect(page.locator(".pg-history-card")).toContainText("La invitación de la luna");await expect(page.getByText("Guardado en este dispositivo",{exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-output .pg-story-title")).toHaveText("La invitación de la luna");
  await page.locator(".language-picker select").selectOption("en");await page.getByLabel("Make a",{exact:true}).selectOption("poem");
  const second=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  expect((await second).postDataJSON().settings).toMatchObject({kind:"poem",locale:"en"});await expect(page.locator(".pg-output .pg-story-title")).toHaveText("The Moon’s Invitation");
});

test("context, model settings and inspector remain usable on a phone",async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.getByRole("button",{name:"Add context",exact:true})).toHaveAttribute("aria-expanded","true");
  await page.getByLabel("Scene title",{exact:true}).fill("A tiny world");await page.locator(".pg-node").first().click();
  await page.getByLabel("Chosen meaning",{exact:true}).fill("The explorer");await page.getByLabel("Chosen meaning",{exact:true}).press("Tab");
  await page.getByLabel("Connect to",{exact:true}).selectOption("moon");await page.getByLabel("Relationship label",{exact:true}).fill("dreams of");await page.getByRole("button",{name:"Connect",exact:true}).click();
  await expect(page.locator(".pg-relationships")).toContainText("dreams of");
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Text model",{exact:true}).selectOption("test/other");await page.getByLabel("Reasoning effort",{exact:true}).selectOption("high");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  const payload=(await request).postDataJSON();expect(payload.settings).toMatchObject({model:"test/other",reasoningEffort:"high"});expect(payload.board.edges[0].label).toBe("dreams of");expect(payload.board.nodes[0].meaning).toBe("The explorer");
});
