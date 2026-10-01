import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
async function clickEmoji(page:Page,label:string){
  const emoji=page.getByLabel(label,{exact:true});
  // Move onto the orbiting target first, just as a pointer user does.
  await emoji.hover({force:true});
  await emoji.click();
}
async function stubSources(page:Page){
  await page.route("**/api/related?**",route=>route.fulfill({json:{status:"ready",topics:[{label:"Marine biology",query:"Marine biology",englishQuery:"Marine biology",wikiTitle:"Marine biology",language:"en",wikiId:55,description:"The study of life in the sea"}]}}));
  await page.route("**/api/resolve?**",async route=>{
    const url=new URL(route.request().url());const id=url.searchParams.get("emojiId");const spanish=url.searchParams.get("locale")==="es";
    const label=id==="2764"?(spanish?"Amor":"Love"):id==="1F44B"?(spanish?"Mano":"Hand"):(spanish?"Pulpo":"Octopus");
    const topic={label,query:label,englishQuery:spanish?"Octopus":label,language:spanish?"es":"en",wikiTitle:label};
    await route.fulfill({json:{defaultTopic:topic,alternatives:id==="2764"?[{label:"Human heart",query:"Human heart",englishQuery:"Human heart",language:"en",wikiTitle:"Human heart"}]:[{label:"Ocean",query:"Ocean",englishQuery:"Ocean",language:"en",wikiTitle:"Ocean"}]}});
  });
  await page.route("**/api/discover",async route=>{
    const input=route.request().postDataJSON();
    if(input.provider==="wikipedia")await route.fulfill({json:{status:"ready",items:[{id:"1",title:input.topic.label,excerpt:`Context for ${input.topic.label}. This is a test response.`,sourceUrl:"https://en.wikipedia.org/wiki/Octopus",revisionUrl:"https://en.wikipedia.org/w/index.php?oldid=1",license:"CC BY-SA",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/",language:input.topic.language}]}});
    else await route.fulfill({json:{status:"unavailable",items:[],reason:"credentials"}});
  });
}
test.beforeEach(async({page})=>{await stubSources(page);await page.goto("/");});
test("bilingual search, keyboard reveal, favorites, history and persistence",async({page})=>{
  await page.getByRole("textbox",{name:/Search a word/}).fill("pulpo");
  const octopus=page.getByLabel("octopus",{exact:true});await expect(octopus).toBeVisible();await octopus.focus();await octopus.press("Enter");
  await page.getByRole("button",{name:"Open portal",exact:true}).first().press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByText("Context for Octopus.",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Save discovery",exact:true}).click();await expect(page.getByRole("button",{name:"Remove favorite"})).toBeVisible();
  await page.getByRole("button",{name:"Close gallery"}).click();await page.reload();await page.getByRole("button",{name:/Favorites/}).click();await expect(page.locator(".saved-card")).toHaveCount(1);
  await page.locator(".saved-card").click();await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("button",{name:"Close gallery"}).click();
  await page.getByRole("button",{name:/History/}).click();await expect(page.locator(".saved-card")).toHaveCount(1);await page.getByRole("button",{name:"Clear all"}).click();await expect(page.locator(".saved-card")).toHaveCount(0);
});
test("dragging into the portal opens the same subject and Escape closes",async({page})=>{
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");
  const emoji=page.getByLabel("octopus",{exact:true});await expect(page.locator(".emoji-button")).toHaveCount(1);
  await page.locator(".dream-canvas").scrollIntoViewIfNeeded();
  await emoji.hover({force:true});
  await expect(emoji).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(emoji).toHaveCSS("border-top-color","rgba(0, 0, 0, 0)");
  const dragFont=await emoji.locator(".emoji-glyph").evaluate(el=>parseFloat(getComputedStyle(el).fontSize)*2);
  const start=await emoji.boundingBox(),end=await page.locator(".portal").boundingBox();
  await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();await page.mouse.move(start!.x+start!.width/2+10,start!.y+start!.height/2,{steps:3});
  await expect(page.locator(".drag-ghost")).toHaveCSS("font-size",`${dragFont}px`);
  await page.mouse.move(end!.x+end!.width/2,end!.y+end!.height/2,{steps:20});
  await expect(page.locator(".drag-ghost")).toHaveCSS("font-size",`${dragFont}px`);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("heading",{name:"Octopus",exact:true,level:2})).toBeVisible();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("subject changes discard stale media while other providers remain usable",async({page})=>{
  await page.unroute("**/api/discover");
  await page.route("**/api/discover",async route=>{
    const input=route.request().postDataJSON();if(input.topic.label==="Love")await new Promise(r=>setTimeout(r,600));
    try{await route.fulfill({json:input.provider==="wikipedia"?{status:"ready",items:[{id:"1",title:input.topic.label,excerpt:`Fresh ${input.topic.label} context.`,sourceUrl:"https://en.wikipedia.org/wiki/Heart",language:"en"}]}:{status:"error",items:[],reason:"timeout"}});}catch{/* Old browser requests are intentionally cancelled. */}
  });
  await page.getByRole("textbox",{name:/Search a word/}).fill("red heart");await clickEmoji(page,"red heart");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await page.getByRole("button",{name:"Human heart",exact:false}).click();await expect(page.getByText("Fresh Human heart context.")).toBeVisible();await page.waitForTimeout(700);await expect(page.getByText("Fresh Love context.")).toHaveCount(0);await expect(page.getByRole("button",{name:"Try again"}).first()).toBeVisible();
  await page.getByRole("button",{name:"Close gallery"}).click();await expect(page.locator("iframe, audio")).toHaveCount(0);
});
test("corrupt storage, pagination and variant selection remain usable",async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("dream-maker-v1","{broken"));await page.reload();await expect(page.getByRole("heading",{level:1})).toBeVisible();
  await page.getByRole("button",{name:"Next page"}).click();await expect(page.getByText("Page 2 / 40")).toBeVisible();
  await page.getByRole("textbox",{name:/Search a word/}).fill("waving hand");await clickEmoji(page,"waving hand");await page.getByLabel("Choose a variant").selectOption("👋🏽");
  await page.getByRole("button",{name:"Open portal",exact:true}).last().click();await expect(page.locator(".gallery-emoji")).toHaveText("👋🏽");
});
test("Spanish interface and phone tap flow have no horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.getByLabel("Interface language").selectOption("es");
  await page.getByRole("textbox",{name:/Busca una palabra/}).fill("pulpo");await clickEmoji(page,"pulpo");await page.getByRole("button",{name:"Abrir portal",exact:true}).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByRole("heading",{name:"Pulpo",exact:true,level:2})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole("button",{name:"Cerrar galería"}).click();await page.getByRole("button",{name:"Cuadrícula"}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("reduced motion removes floating and the dialog traps focus",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await expect(page.locator(".app-shell")).toHaveClass(/reduced/);expect(await page.locator(".emoji-glyph").first().evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await page.getByRole("button",{name:"Close gallery"}).focus();await page.keyboard.press("Shift+Tab");expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);await expect(page.locator(".app-shell")).toHaveAttribute("inert","");
});
test("audio starts only on request and closing pauses retained media and destroys video embeds",async({page})=>{
  await page.unroute("**/api/discover");
  await page.route("**/api/discover",async route=>{
    const input=route.request().postDataJSON();const provider=input.provider;
    const items=provider==="youtube"?[{id:"test-video",title:"Test video",sourceUrl:"https://www.youtube.com/watch?v=test-video",embedUrl:"https://www.youtube-nocookie.com/embed/test-video"}]:provider==="freesound"?[{id:"test-sound",title:"Test sound",sourceUrl:"https://freesound.org/s/1/",previewUrl:"https://media.example.test/preview.wav",creator:"Test creator",license:"CC0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/"}]:[];
    await route.fulfill({json:{status:items.length?"ready":"empty",items}});
  });
  await page.route("https://www.youtube-nocookie.com/embed/test-video**",route=>route.fulfill({contentType:"text/html",body:"<p>Test video embed</p>"}));
  const wav=Buffer.alloc(44+16000*2);wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(wav.length-44,40);
  await page.route("https://media.example.test/preview.wav",route=>route.fulfill({contentType:"audio/wav",body:wav}));
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  const audio=page.locator("audio");await expect(audio).toHaveCount(1);expect(await audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button",{name:"Play video: Test video"}).click();await expect(page.locator("iframe")).toHaveCount(1);
  await page.getByRole("button",{name:"Close video",exact:true}).click();
  await audio.evaluate(el=>{(window as unknown as {testAudio:HTMLAudioElement}).testAudio=el as HTMLAudioElement;});
  await audio.click({position:{x:17,y:15}});await expect.poll(()=>audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(false);
  await page.getByRole("button",{name:"Play video: Test video"}).click();expect(await audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole("button",{name:"Close video",exact:true}).click();
  await page.getByRole("button",{name:"Close gallery"}).click();await expect(page.locator("iframe, audio")).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {testAudio:HTMLAudioElement}).testAudio.paused)).toBe(true);
});
test("repeated server renders hydrate without accessibility ID mismatches",async({page})=>{
  const errors:string[]=[];page.on("console",message=>{if(message.type()==="error"&&/hydrat|didn't match/i.test(message.text()))errors.push(message.text());});
  await page.reload();await clickEmoji(page,"octopus");await page.reload();await clickEmoji(page,"octopus");expect(errors).toEqual([]);
});
test("emojis orbit upright, double on hover, pause for picking, and resume",async({page})=>{
  await page.locator(".dream-canvas").scrollIntoViewIfNeeded();
  await page.mouse.move(0,0);
  const emoji=page.getByLabel("octopus",{exact:true});
  const first=await emoji.boundingBox();
  await page.waitForTimeout(700);
  const moved=await emoji.boundingBox();
  expect(Math.hypot(moved!.x-first!.x,moved!.y-first!.y)).toBeGreaterThan(2);
  await emoji.hover({force:true});
  await expect.poll(()=>emoji.locator(".emoji-glyph").evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeCloseTo(2,1);
  const paused=await emoji.boundingBox();
  await page.waitForTimeout(400);
  const still=await emoji.boundingBox();
  expect(Math.hypot(still!.x-paused!.x,still!.y-paused!.y)).toBeLessThan(.5);
  expect(await emoji.evaluate(el=>{
    const parent=new DOMMatrixReadOnly(getComputedStyle(el.parentElement!).transform);
    const own=new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.abs(parent.multiply(own).b);
  })).toBeLessThan(.01);
  await page.mouse.move(0,0);
  await page.waitForTimeout(700);
  const resumed=await emoji.boundingBox();
  expect(Math.hypot(resumed!.x-still!.x,resumed!.y-still!.y)).toBeGreaterThan(2);
  await expect(page.locator(".black-hole")).toBeVisible();
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await emoji.evaluate(el=>getComputedStyle(el.parentElement!).animationName)).toBe("none");
});
test("drag previews preserve the grab point across orbital positions",async({page})=>{
  await page.locator(".dream-canvas").scrollIntoViewIfNeeded();
  const canvas=await page.locator(".dream-canvas").boundingBox();
  for(const label of ["red heart","octopus","crescent moon","flag: Colombia"]){
    const emoji=page.getByLabel(label,{exact:true});
    await emoji.hover({force:true});
    const source=(await emoji.boundingBox())!;
    const grab={x:source.x+source.width*.6,y:source.y+source.height*.4};
    await page.mouse.move(grab.x,grab.y);await page.mouse.down();
    for(const destination of [{x:grab.x+10,y:grab.y},{x:canvas!.x+canvas!.width/2,y:canvas!.y+canvas!.height/2}]){
      await page.mouse.move(destination.x,destination.y,{steps:4});
      await expect(page.locator(".drag-ghost")).toBeVisible();
      const preview=(await page.locator(".drag-ghost").boundingBox())!;
      const expected={x:source.x+source.width/2+destination.x-grab.x,y:source.y+source.height/2+destination.y-grab.y};
      expect(Math.abs(preview.x+preview.width/2-expected.x),`${label} horizontal grab offset`).toBeLessThan(2);
      expect(Math.abs(preview.y+preview.height/2-expected.y),`${label} vertical grab offset`).toBeLessThan(2);
    }
    await page.keyboard.press("Escape");await page.mouse.up();
    await expect(page.locator(".drag-ghost")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("related articles open a fresh summary and back restores the exploration",async({page})=>{
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.getByText("Context for Octopus.",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:/Marine biology The study/}).click();
  await expect(page.getByRole("heading",{level:2,name:"Marine biology",exact:true})).toBeVisible();
  await expect(page.getByText("Context for Marine biology.",{exact:false})).toBeVisible();
  await expect(page.getByText("Context for Octopus.",{exact:false})).toHaveCount(0);
  await page.getByRole("button",{name:"Back to Octopus"}).click();
  await expect(page.getByText("Context for Octopus.",{exact:false})).toBeVisible();
  await expect(page.getByRole("heading",{level:2,name:"Octopus",exact:true})).toBeFocused();
});
test("missing Wikipedia article offers correction and direct search, then recovers",async({page})=>{
  await page.route("**/api/discover",async route=>{
    const body=route.request().postDataJSON();
    await route.fulfill({json:body.provider==="wikipedia"?{status:"empty",items:[]}:{status:"unavailable",items:[],reason:"credentials"}});
  });
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.getByRole("heading",{name:"Let’s find the right idea"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Search Wikipedia"})).toHaveAttribute("href",/search=Octopus/);
  await page.getByRole("button",{name:"Choose a different concept"}).click();
  await expect(page.getByRole("textbox",{name:"Search a different subject"})).toBeFocused();
});
test("related source failure leaves the summary readable and can be retried",async({page})=>{
  await page.route("**/api/related?**",route=>route.fulfill({json:{status:"error",topics:[]}}));
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.getByText("Connections couldn’t load. The article is still available.")).toBeVisible();
  await expect(page.getByText("Context for Octopus.",{exact:false})).toBeVisible();
  await page.route("**/api/related?**",route=>route.fulfill({json:{status:"ready",topics:[{label:"Ocean",query:"Ocean",englishQuery:"Ocean",language:"en",wikiTitle:"Ocean"}]}}));
  await page.locator(".related-status").getByRole("button",{name:"Try again"}).click();
  await expect(page.locator(".related-grid").getByRole("button",{name:"Ocean",exact:true})).toBeVisible();
});

test("learning video opens a large autoplay popup and closes without losing the discovery",async({page})=>{
  await page.route("**/api/discover",async route=>{
    const input=route.request().postDataJSON();
    if(input.provider!=="youtube")return route.fulfill({json:{status:"empty",items:[]}});
    await route.fulfill({json:{status:"ready",items:[{id:"lesson",title:"Octopus intelligence explained",creator:"Marine teacher",durationSeconds:480,sourceUrl:"https://www.youtube.com/watch?v=lesson",embedUrl:"https://www.youtube-nocookie.com/embed/lesson"}]}});
  });
  await page.route("https://www.youtube-nocookie.com/embed/lesson**",route=>route.fulfill({contentType:"text/html",body:"<p>Lesson player</p>"}));
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  const play=page.getByRole("button",{name:"Play video: Octopus intelligence explained"});
  await expect(page.locator(".video-duration")).toHaveText("8:00");await expect(page.locator("iframe")).toHaveCount(0);
  const preview=(await play.boundingBox())!;
  await play.click();
  const popup=page.getByRole("dialog",{name:"Octopus intelligence explained",exact:true});
  await expect(popup).toBeVisible();await expect(popup.getByRole("button",{name:"Close video",exact:true})).toBeFocused();
  const iframe=popup.locator("iframe");const src=new URL((await iframe.getAttribute("src"))!);
  expect(src.searchParams.get("autoplay")).toBe("1");expect(src.searchParams.get("playsinline")).toBe("1");
  await expect(iframe).toHaveAttribute("allow",/autoplay/);expect((await iframe.boundingBox())!.width).toBeGreaterThan(preview.width*2);
  await page.keyboard.press("Tab");await page.keyboard.press("Tab");await page.keyboard.press("Tab");
  expect(await page.evaluate(()=>!!document.activeElement?.closest("dialog.video-dialog"))).toBe(true);
  await popup.getByRole("button",{name:"Close video",exact:true}).click();await expect(iframe).toHaveCount(0);await expect(play).toBeFocused();
  await expect(page.locator(".gallery")).toBeVisible();
  await play.click();await page.mouse.click(2,2);await expect(popup).toHaveCount(0);await expect(play).toBeFocused();
  await play.click();await page.keyboard.press("Escape");await expect(popup).toHaveCount(0);await expect(page.locator(".gallery")).toBeVisible();
  await expect(play).toBeFocused();
  await page.setViewportSize({width:1280,height:720});await play.click();
  const laptop=(await popup.boundingBox())!;expect(laptop.y+laptop.height).toBeLessThanOrEqual(720);
  await popup.getByRole("button",{name:"Close video",exact:true}).click();
  await page.setViewportSize({width:390,height:844});await play.click();await expect(popup).toBeVisible();
  const bounds=(await popup.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  expect((await iframe.boundingBox())!.height).toBeGreaterThanOrEqual(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await popup.getByRole("button",{name:"Close video",exact:true}).click();await page.getByRole("button",{name:"Close gallery"}).click();
  await expect(page.locator("iframe, dialog")).toHaveCount(0);
});
test("Wikipedia rate-limit recovery shows a countdown without automatic extra requests",async({page})=>{
  let attempts=0;
  await page.route("**/api/discover",async route=>{
    const body=route.request().postDataJSON();
    if(body.provider==="wikipedia"){attempts++;await route.fulfill({json:attempts===1?{status:"unavailable",items:[],reason:"quota",retryAfter:1}:{status:"ready",items:[{id:"1",title:"Octopus",excerpt:"Recovered Wikipedia context.",sourceUrl:"https://en.wikipedia.org/wiki/Octopus",language:"en"}]}});}
    else await route.fulfill({json:{status:"unavailable",items:[],reason:"credentials"}});
  });
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  const retry=page.locator(".wiki-unavailable").getByRole("button",{name:/Try again/});
  await expect(retry).toBeDisabled();await expect(retry).toBeEnabled();expect(attempts).toBe(1);
  await retry.click();await expect(page.getByText("Recovered Wikipedia context.")).toBeVisible();expect(attempts).toBe(2);
});
