import { restoreBoard } from "./helpers/playground-workspace";
import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const board={schemaVersion:1,title:"",intent:"",interpretation:"",edges:[],nodes:[{id:"bear",emojiId:"1F9F8",glyph:"🧸",label:"Teddy bear",meaning:"A curious traveler",note:"",role:"subject",x:45,y:45,scale:1,rotation:0},{id:"moon",emojiId:"1F319",glyph:"🌙",label:"Moon",meaning:"An unfamiliar world",note:"",role:"setting",x:65,y:30,scale:1,rotation:0}]};
async function open(page:Page){
  await page.route("**/api/generations",route=>route.request().method()==="GET"?route.fulfill({json:{configured:true,models:["test/text","test/other"],maxOutputTokens:8192}}):route.fulfill({json:{result:{title:route.request().postDataJSON().settings.locale==="es"?"La invitación de la luna":"The Moon’s Invitation",text:route.request().postDataJSON().settings.locale==="es"?"Estos símbolos sugieren un viaje hacia lo desconocido.":"These symbols suggest a journey into the unknown.",model:"test/text",provider:"openrouter"}}}));
  await page.goto("/");await page.getByRole("button",{name:"Playground",exact:true}).click();await expect(page.locator(".pg-board")).toBeVisible();
  await restoreBoard(page,board);await expect(page.locator(".pg-node")).toHaveCount(2);
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
  await expect(page.getByLabel("Output language",{exact:true})).toBeHidden();await expect(page.getByLabel("Tone",{exact:true})).toHaveCount(0);
  await expect(page.locator("#pg-context")).toBeHidden();await expect(page.locator("#pg-symbol-editor")).toBeHidden();await expect(page.locator("#pg-generation-settings")).toBeHidden();
  await expect(page.locator(".pg-generate")).toHaveText("Generate");await centered(page);
  expect((await page.locator(".pg-creation-header").boundingBox())!.height).toBeLessThan(235);
  await page.getByRole("button",{name:"Context",exact:true}).click();
  const meaning=page.locator(".pg-meaning"),main=page.locator(".pg-header-main");
  await expect(meaning.getByLabel("Scene title",{exact:true})).toBeVisible();await expect(meaning).toContainText("Optional");
  expect((await page.locator("#pg-context").boundingBox())!.width).toBeCloseTo((await main.boundingBox())!.width,0);await centered(page);
  await page.getByLabel("Scene title",{exact:true}).fill("My own title");await page.getByLabel("What do you want to express?",{exact:true}).fill("Finding courage in an unfamiliar world.");
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.locator("#pg-symbol-editor")).toBeVisible();
  const left=await meaning.boundingBox(),right=await page.locator("#pg-symbol-editor").boundingBox();expect(left!.width).toBeCloseTo(right!.width,0);expect(right!.x).toBeGreaterThan(left!.x+left!.width);await centered(page);
  await page.locator(".pg-node").first().click();await expect(page.getByLabel("Chosen meaning",{exact:true})).toHaveValue("A curious traveler");
  await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.locator("#pg-symbol-editor")).toBeHidden();expect((await page.locator("#pg-context").boundingBox())!.width).toBeCloseTo((await main.boundingBox())!.width,0);
  await page.getByRole("button",{name:"Context",exact:true}).click();await expect(page.getByLabel("Scene title",{exact:true})).toBeHidden();
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  const payload=(await request).postDataJSON();expect(payload.board.title).toBe("My own title");expect(payload.board.intent).toBe("Finding courage in an unfamiliar world.");
  // The generated title labels the creation; the scene title stays in its input snapshot.
  await expect(page.locator(".pg-output .pg-story-title")).toHaveText("The Moon’s Invitation");
});

test("blank titles are generated and retained; output language is configurable independently",async({page})=>{
  await open(page);await page.getByLabel("Interface language").selectOption("es");await page.getByRole("button",{name:"Ajustes",exact:true}).click();await page.getByLabel("Idioma del resultado",{exact:true}).selectOption("es");
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generar",exact:true}).click();
  expect((await request).postDataJSON()).toMatchObject({board:{title:""},settings:{kind:"interpretation",locale:"es"}});
  await expect(page.locator(".pg-output .pg-story-title")).toHaveText("La invitación de la luna");await expect(page.locator(".pg-output .pg-story-prose")).toHaveText("Estos símbolos sugieren un viaje hacia lo desconocido.");
  await expect(page.locator(".pg-history-card").first()).toContainText("La invitación de la luna");await expect(page.locator(".pg-save")).not.toHaveText(/Saving|Guardando/);
  await page.reload();await page.getByRole("button",{name:"Espacio creativo",exact:true}).click();await expect(page.locator(".pg-output .pg-story-prose")).toHaveCount(0);await expect(page.locator(".pg-history-card").first()).toContainText("La invitación de la luna");await restoreBoard(page,board);
  await page.locator(".language-picker select").selectOption("en");await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Output language",{exact:true}).selectOption("en");await page.getByLabel("Make a",{exact:true}).selectOption("poem");
  const second=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  expect((await second).postDataJSON().settings).toMatchObject({kind:"poem",locale:"en"});await expect(page.locator(".pg-output .pg-story-title")).toHaveText("The Moon’s Invitation");
});

test("context, model settings and inspector remain usable on a phone",async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.getByRole("button",{name:"Context",exact:true}).click();await page.getByRole("button",{name:"Add relationships",exact:true}).click();await expect(page.getByRole("button",{name:"Context",exact:true})).toHaveAttribute("aria-expanded","true");
  await page.getByLabel("Scene title",{exact:true}).fill("A tiny world");await page.locator(".pg-node").first().click();
  await page.getByLabel("Chosen meaning",{exact:true}).fill("The explorer");await page.getByLabel("Chosen meaning",{exact:true}).press("Tab");
  await page.getByLabel("Connect to",{exact:true}).selectOption("moon");await page.getByLabel("Relationship label",{exact:true}).fill("dreams of");await page.getByRole("button",{name:"Connect",exact:true}).click();
  await expect(page.locator(".pg-relationships")).toContainText("dreams of");
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Text model",{exact:true}).selectOption("test/other");await page.getByLabel("Reasoning effort",{exact:true}).selectOption("high");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const request=page.waitForRequest(r=>r.url().endsWith("/api/generations")&&r.method()==="POST");await page.getByRole("button",{name:"Generate",exact:true}).click();
  const payload=(await request).postDataJSON();expect(payload.settings).toMatchObject({model:"test/other",reasoningEffort:"high"});expect(payload.board.edges[0].label).toBe("dreams of");expect(payload.board.nodes[0].meaning).toBe("The explorer");
});

test("Context contains relationships and preserves fields, canvas and result UI until refresh",async({page})=>{
  await open(page);
  const context=page.getByRole("button",{name:"Context",exact:true});
  await expect(page.getByRole("button",{name:"Add relationships",exact:true})).toHaveCount(0);
  await context.click();
  const relation=page.locator("#pg-context").getByRole("button",{name:"Add relationships",exact:true});
  await relation.click();await page.locator('.pg-node').first().click();
  await page.getByLabel("Scene title",{exact:true}).fill("A hidden world");
  await page.getByLabel("Your note",{exact:true}).fill("Keep this detail");
  await page.getByLabel("Connect to",{exact:true}).selectOption("moon");
  await page.getByLabel("Relationship label",{exact:true}).fill("travels toward");
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  const zoom=await page.getByLabel("Canvas zoom",{exact:true}).textContent();
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await page.locator('.pg-output').getByRole("button",{name:"Edit output",exact:true}).click();
  await page.locator('.pg-output').getByLabel("Edit output",{exact:true}).fill("A revised journey.");
  await context.click();await context.click();
  await expect(relation).toHaveAttribute("aria-expanded","true");
  await expect(page.getByLabel("Scene title",{exact:true})).toHaveValue("A hidden world");
  await expect(page.getByLabel("Your note",{exact:true})).toHaveValue("Keep this detail");
  await expect(page.getByLabel("Relationship label",{exact:true})).toHaveValue("travels toward");
  await page.getByRole("button",{name:"Discover",exact:true}).click();await page.getByRole("button",{name:"Playground",exact:true}).click();
  await expect(relation).toHaveAttribute("aria-expanded","true");
  await expect(page.getByLabel("Canvas zoom",{exact:true})).toHaveText(zoom!);
  await expect(page.locator('.pg-output').getByLabel("Edit output",{exact:true})).toHaveValue("A revised journey.");
  await relation.click();await context.click();await context.click();
  await expect(relation).toHaveAttribute("aria-expanded","false");
  await expect(page.locator('#pg-symbol-editor')).toBeHidden();
  await expect(page.locator(".pg-save")).not.toHaveText(/Saving|Guardando/);
  await page.reload();await page.getByRole("button",{name:"Playground",exact:true}).click();
  await expect(page.locator('.pg-node')).toHaveCount(0);await expect(page.locator('.pg-output .pg-story-prose')).toHaveCount(0);
  await expect(context).toHaveAttribute("aria-expanded","false");
  await expect(page.getByLabel("Canvas zoom",{exact:true})).toHaveText("100%");
  await context.click();await expect(relation).toHaveAttribute("aria-expanded","false");
  await expect(page.getByLabel("Scene title",{exact:true})).toHaveValue("");
  await page.locator('.pg-history-read').first().click();await expect(page.locator('.pg-reader .pg-story-prose')).toHaveText("A revised journey.");
});

test("settings separate model choices from supporting information in every palette",async({page})=>{
  await open(page);
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const theme of ['classic','cyberpunk','solarpunk','retro']){
      await page.getByLabel("Themes",{exact:true}).selectOption(theme);
      const settings=page.getByRole("button",{name:"Settings",exact:true});
      if(await settings.getAttribute('aria-expanded')==='false')await settings.click();
      await expect(page.locator('#pg-generation-settings select')).toHaveCount(3);
      await expect(page.locator('#pg-generation-settings p')).toHaveCount(1);
      await expect(page.locator('#pg-generation-settings')).not.toContainText('Completion limit');
      const info=page.getByRole("button",{name:"Settings information",exact:true}),panel=page.getByRole("dialog",{name:"Settings information",exact:true});
      await info.hover();await expect(panel).toBeVisible();await expect(panel).toContainText('Completion limit');await expect(panel).toContainText('OpenRouter configured');
      await panel.hover();await expect(panel).toBeVisible();
      const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).exclude('nextjs-portal').analyze();expect(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),`${theme}, ${viewport.width}`).toEqual([]);
      const box=(await panel.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
      await page.getByLabel('Make a',{exact:true}).hover();await expect(panel).toBeHidden();
      await info.focus();await expect(panel).toBeHidden();await info.hover();await expect(panel).toBeVisible();await info.press('Escape');await expect(panel).toBeHidden();
      await page.getByLabel('Make a',{exact:true}).hover();await info.hover();await info.click();await expect(panel).toBeVisible();await settings.click();await expect(panel).toBeHidden();
    }
  }
  await page.getByLabel('Interface language').selectOption('es');await expect(page.getByRole('button',{name:'Contexto',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Información de ajustes',exact:true}).hover();await expect(page.getByRole('dialog',{name:'Información de ajustes',exact:true})).toContainText('Antes de generar');
});

test("connection help and retry remain available from settings information",async({page})=>{
  let configured=false;
  await page.route('**/api/generations',route=>route.fulfill({json:{configured,models:configured?['test/text']:[],maxOutputTokens:8192}}));
  await page.goto('/');await page.getByRole('button',{name:'Playground',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('#pg-generation-settings')).not.toContainText('OPENROUTER_API_KEY');
  const info=page.getByRole('button',{name:'Settings information',exact:true});await info.hover();
  const panel=page.getByRole('dialog',{name:'Settings information',exact:true});
  await expect(panel).toContainText('OPENROUTER_API_KEY');
  const retry=panel.getByRole('button',{name:'Check connection',exact:true});await expect(retry).toBeEnabled();
  configured=true;await retry.click();await expect(panel).toContainText('OpenRouter configured');
  await expect(page.getByLabel('Text model',{exact:true})).toHaveValue('test/text');
  await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(info).toBeFocused();
});
