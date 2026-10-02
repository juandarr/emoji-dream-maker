import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
async function clickEmoji(page:Page,label:string){
  const emoji=page.getByLabel(label,{exact:true});
  // Move onto the orbiting target first, just as a pointer user does.
  await emoji.hover({force:true});
  await emoji.click();
}
async function stubSources(page:Page){
  await page.route("https://api.giphy.com/**",route=>route.fulfill({json:{data:[]}}));
  await page.route("https://www.youtube.com/iframe_api",route=>route.abort());
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
  const errors:Error[]=[];page.on("pageerror",error=>errors.push(error));
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
  await expect(page.getByRole("dialog",{name:"Octopus",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Octopus",exact:true,level:2})).toBeVisible();
  for(const section of [".wikipedia-section",".art-section",".youtube-section",".giphy-section",".freesound-section"]){
    await expect(page.locator(section)).toHaveCount(1);
  }
  await expect(page.getByRole("heading",{name:"The visual gallery",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
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
for (const locale of ["en", "es"] as const) {
  test(`sound connections are localized and playback waits for a click (${locale})`, async ({page}) => {
    if (locale === "es") {
      await page.setViewportSize({width:390,height:844});
      await page.getByLabel("Interface language").selectOption("es");
    }
    await page.route("**/api/discover", async route => {
      if (route.request().postDataJSON().provider !== "freesound") return route.fallback();
      await route.fulfill({json:{status:"ready",partial:true,items:[{
        id:"underwater",title:"Underwater recording",creator:"Sound creator",sourceUrl:"https://freesound.org/s/1/",
        previewUrl:"https://media.example.test/preview.mp3",license:"CC0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",
        soundConnection:{label:locale==="es"?"ambiente submarino":"underwater ambience",kind:"evocative"},
      }]}});
    });
    await page.getByRole("textbox",{name:locale==="es"?/Busca una palabra/:/Search a word/}).fill("octopus");
    await clickEmoji(page,locale==="es"?"pulpo":"octopus");
    await page.getByRole("button",{name:locale==="es"?"Abrir portal":"Open portal",exact:true}).first().click();
    const sounds = page.locator(".freesound-section");
    await expect(sounds.locator(".sound-connection")).toHaveText(locale==="es"?"Evoca: ambiente submarino":"Evokes: underwater ambience");
    await expect(sounds.getByRole("status")).toHaveText(locale==="es"?"No pudimos completar algunas búsquedas de sonidos.":"Some sound searches could not be completed.");
    await expect(sounds.getByRole("link",{name:"CC0"})).toHaveAttribute("href","https://creativecommons.org/publicdomain/zero/1.0/");
    const audio = sounds.locator("audio");
    await expect(audio).toHaveAttribute("preload","none"); expect(await audio.evaluate(el=>(el as HTMLAudioElement).paused)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole("button",{name:locale==="es"?"Cerrar galería":"Close gallery",exact:true}).click();
    await expect(page.locator("audio")).toHaveCount(0);
  });
}
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

test("black hole light keeps flowing during drag and accelerates with proximity",async({page})=>{
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");
  await expect(page.locator(".emoji-button")).toHaveCount(1);
  await page.locator(".dream-canvas").scrollIntoViewIfNeeded();
  await page.mouse.move(0,0);
  const flow=page.locator(".black-hole-flow").first();
  const rate=()=>flow.evaluate(el=>el.getAnimations()[0]?.playbackRate||0);
  const time=()=>flow.evaluate(el=>Number(el.getAnimations()[0]?.currentTime));
  await expect.poll(rate).toBe(1);
  const idle=await time();await page.waitForTimeout(150);
  expect(await time()).toBeGreaterThan(idle);

  const emoji=page.getByLabel("octopus",{exact:true});
  await emoji.hover({force:true});
  const source=(await emoji.boundingBox())!;
  const target=(await page.locator(".portal").boundingBox())!;
  const center={x:target.x+target.width/2,y:target.y+target.height/2};
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);
  await page.mouse.down();
  await page.mouse.move(center.x+target.width,center.y,{steps:10});
  await expect(page.locator(".drag-ghost")).toBeVisible();
  await expect.poll(rate).toBeGreaterThan(2);
  const far=await rate();
  const flowing=await time();await page.waitForTimeout(150);
  expect(await time()).toBeGreaterThan(flowing);
  await page.mouse.move(center.x+target.width*.45,center.y,{steps:10});
  await expect.poll(rate).toBeGreaterThan(far+.8);
  const nearer=await rate();
  await page.mouse.move(center.x,center.y,{steps:10});
  await expect.poll(rate).toBeGreaterThan(nearer+.3);
  await expect.poll(rate).toBeGreaterThan(5.3);
  await page.mouse.move(center.x+target.width,center.y,{steps:10});
  await expect.poll(rate).toBeLessThan(3.5);
  await page.keyboard.press("Escape");await page.mouse.up();
  await expect.poll(rate).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button",{name:"Reduce motion",exact:true}).click();
  await expect.poll(()=>flow.evaluate(el=>el.getAnimations().length)).toBe(0);
  await page.getByRole("button",{name:"Reduce motion",exact:true}).click();
  await expect.poll(rate).toBe(1);
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect.poll(()=>flow.evaluate(el=>el.getAnimations().length)).toBe(0);
});

test("lensing follows either side, turns white with agitation, and settles after release or a portal visit",async({page})=>{
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");
  await expect(page.locator(".emoji-button")).toHaveCount(1);
  await page.locator(".dream-canvas").scrollIntoViewIfNeeded();
  const emoji=page.locator('.emoji-button[aria-label="octopus"]');
  await emoji.hover({force:true});
  const source=(await emoji.boundingBox())!;
  const target=(await page.locator(".portal").boundingBox())!;
  const center={x:target.x+target.width/2,y:target.y+target.height/2};
  const heat=()=>page.locator(".black-hole-energy-map").evaluate(el=>Number(el.getAttribute("values")!.split(" ")[4]));
  const tilt=()=>page.locator(".black-hole-body").evaluate(el=>(el as SVGGraphicsElement).transform.baseVal.consolidate()!.matrix.b);
  const rate=()=>page.locator(".black-hole-flow").first().evaluate(el=>el.getAnimations()[0]?.playbackRate||0);
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);
  await page.mouse.down();
  await page.mouse.move(center.x+target.width*.35,center.y,{steps:12});
  await expect(page.locator(".drag-emoji-lens")).toBeVisible();
  await expect(page.locator(".gravity-echo")).toBeVisible();
  await expect.poll(tilt).toBeGreaterThan(.02);
  await page.mouse.move(center.x-target.width*.35,center.y,{steps:12});
  await expect.poll(tilt).toBeLessThan(-.02);
  for(let i=0;i<10;i++) {
    await page.mouse.move(center.x+(i%2?-.28:.28)*target.width,center.y,{steps:2});
    await page.waitForTimeout(35);
  }
  await expect.poll(heat).toBeGreaterThan(.65);
  await expect.poll(heat,{timeout:5000}).toBeLessThan(.02);
  await expect(page.locator(".drag-emoji-lens")).toBeVisible();
  // Crossing exact alignment must not introduce invalid geometry or lose the grab point.
  await page.mouse.move(center.x,center.y,{steps:8});
  await expect.poll(()=>page.locator(".black-hole-body").getAttribute("transform")).not.toMatch(/NaN|Infinity/);
  const ghost=(await page.locator(".drag-ghost").boundingBox())!;
  expect(Math.hypot(ghost.x+ghost.width/2-center.x,ghost.y+ghost.height/2-center.y)).toBeLessThan(2);
  await page.mouse.move(center.x+target.width*1.85,center.y,{steps:12});
  await expect(page.locator(".drag-emoji-lens")).toHaveCount(0);
  await expect(page.locator(".gravity-echo")).toHaveCount(0);
  await expect.poll(rate).toBe(1);
  await page.keyboard.press("Escape");await page.mouse.up();

  await emoji.hover({force:true});
  const again=(await emoji.boundingBox())!;
  await page.mouse.move(again.x+again.width/2,again.y+again.height/2);await page.mouse.down();
  await page.mouse.move(center.x,center.y,{steps:12});
  await expect(page.locator(".gravity-echo")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("dialog",{name:"Octopus",exact:true})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".gravity-echo")).toHaveCount(0);
  await expect.poll(heat).toBe(0);
  await expect.poll(rate).toBe(1);
  await expect.poll(tilt).toBeCloseTo(0,5);
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

test("three videos show within two seconds while Wikipedia is still resolving, without duplicate searches",async({page})=>{
  let searches=0;
  await page.route("**/api/related?**",route=>route.fulfill({json:{status:"ready",topics:[{label:"Octopus biology",query:"Octopus",englishQuery:"Octopus",language:"en",wikiTitle:"Octopus"}]}}));
  await page.route("**/api/resolve?**",async route=>{
    await new Promise(resolve=>setTimeout(resolve,4000));
    await route.fulfill({json:{defaultTopic:{label:"Octopus",query:"Octopus",englishQuery:"Octopus",language:"en",wikiId:123,wikiTitle:"Octopus"},alternatives:[]}});
  });
  await page.route("**/api/discover",async route=>{
    const input=route.request().postDataJSON();
    if(input.provider!=="youtube")return route.fulfill({json:{status:"ready",items:[{id:"1",title:"Octopus",excerpt:"Octopus context.",sourceUrl:"https://en.wikipedia.org/wiki/Octopus",language:"en"}]}});
    searches++;
    await new Promise(resolve=>setTimeout(resolve,500));
    await route.fulfill({json:{status:"ready",items:[1,2,3].map(i=>({id:`lesson-${i}`,title:`Octopus lesson ${i}`,sourceUrl:`https://www.youtube.com/watch?v=lesson-${i}`,embedUrl:`https://www.youtube-nocookie.com/embed/lesson-${i}`}))}});
  });
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");await clickEmoji(page,"octopus");
  await expect.poll(()=>searches).toBe(1); // Starts on selection, before opening.
  const start=Date.now();
  await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.locator(".video-card")).toHaveCount(3,{timeout:1900});
  expect(Date.now()-start).toBeLessThan(2000);
  await expect(page.getByRole("button",{name:"Save discovery",exact:true})).toBeEnabled({timeout:6000});
  expect(searches).toBe(1); // Wikipedia enrichment did not reset the video cards.
  await expect(page.locator(".video-card")).toHaveCount(3);
  await page.getByRole("button",{name:"Octopus biology",exact:true}).click();
  await expect(page.locator(".video-card")).toHaveCount(3);
  expect(searches).toBe(1);
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

async function stubArt(page: Page, broken = false) {
  await page.route("**/api/discover", async route => {
    const input = route.request().postDataJSON();
    if (input.provider !== "art") return route.fulfill({ json: { status: "empty", items: [] } });
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `museum:${index}`, title: `${input.topic.englishQuery} study ${index + 1}`, creator: "Museum artist", date: "1890", kind: "Painting", collection: "Cleveland Museum of Art", matchedTerm: input.topic.englishQuery.toLowerCase(), previewUrl: `https://openaccess-cdn.clevelandart.org/test-${index}.jpg`, imageUrl: `https://openaccess-cdn.clevelandart.org/test-${index}-large.jpg`, sourceUrl: `https://clevelandart.org/art/${index}`, license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }));
    await route.fulfill({ json: { status: "ready", items, partial: broken } });
  });
  await page.route("https://openaccess-cdn.clevelandart.org/**", route => {
    if (broken && route.request().url().includes("-large")) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#987c6a"/><circle cx="450" cy="350" r="150" fill="#dcc4a3"/></svg>' });
  });
}
async function openArt(page: Page) {
  await page.getByRole("textbox", { name: /Search a word/ }).fill("octopus");
  await clickEmoji(page, "octopus");
  await page.getByRole("button", { name: "Open portal", exact: true }).first().click();
  await expect(page.locator(".artwork-card")).toHaveCount(5);
}
test("museum previews open a larger viewer, browse, zoom and restore focus", async ({ page }) => {
  await stubArt(page);await openArt(page);
  const preview = page.getByRole("button", { name: "Expand image: Octopus study 1", exact: true });
  await expect.poll(() => preview.locator("img").evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(900);
  await expect(page.locator(".artwork-provenance").first()).toContainText("Cleveland Museum of Art");
  await expect(page.locator(".artwork-source").first()).toHaveAttribute("href", "https://clevelandart.org/art/0");
  const previewSize = (await preview.boundingBox())!;
  await preview.click();
  const popup = page.locator(".image-dialog");await expect(popup).toBeVisible();
  await expect(popup.getByRole("button", { name: "Close image", exact: true })).toBeFocused();
  expect((await popup.locator(".image-dialog-stage").boundingBox())!.height).toBeGreaterThan(previewSize.height);
  await expect(popup.locator("img")).toHaveAttribute("src", /test-0-large/);
  await page.keyboard.press("ArrowRight");await expect(popup.getByRole("heading")).toHaveText("Octopus study 2");
  await popup.getByRole("button", { name: "Previous image", exact: true }).click();await expect(popup.getByRole("heading")).toHaveText("Octopus study 1");
  await popup.getByRole("button", { name: "Zoom in", exact: true }).click();await expect(popup.locator(".image-dialog-stage")).toHaveClass(/zoomed/);
  expect(await popup.locator(".image-dialog-stage").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await popup.getByRole("button", { name: "Next image", exact: true }).click();await expect(popup.locator(".image-dialog-stage")).not.toHaveClass(/zoomed/);
  const close = popup.getByRole("button", { name: "Close image", exact: true });await close.focus();await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest(".image-dialog"))).toBe(true);
  await page.keyboard.press("Tab");await expect(close).toBeFocused();
  await page.keyboard.press("Escape");await expect(popup).toHaveCount(0);await expect(preview).toBeFocused();await expect(page.locator(".gallery")).toBeVisible();
  await preview.click();await page.getByRole("button", { name: "Close image", exact: true }).click();await expect(preview).toBeFocused();
  await preview.click();await page.mouse.click(2, 2);await expect(popup).toHaveCount(0);await expect(page.locator(".gallery")).toBeVisible();
});
test("large-image failures fall back to previews and incomplete collections can retry", async ({ page }) => {
  await stubArt(page, true);await openArt(page);
  await expect(page.locator(".art-partial")).toBeVisible();
  await page.getByRole("button", { name: "Expand image: Octopus study 1", exact: true }).click();
  const image = page.locator(".image-dialog img");
  await expect(image).toHaveAttribute("src", /test-0\.jpg$/);
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(900);
  await page.getByRole("button", { name: "Close image", exact: true }).click();
  await page.locator(".art-partial").getByRole("button", { name: "Try again" }).click();await expect(page.locator(".artwork-card")).toHaveCount(5);
});
test("phone image viewer stays inside the screen and Spanish labels are localized", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });await stubArt(page);await openArt(page);
  await page.getByRole("button", { name: "Expand image: Octopus study 1", exact: true }).click();
  const popup = page.locator(".image-dialog"), bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(await popup.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Close image", exact: true }).click();await page.getByRole("button", { name: "Close gallery", exact: true }).click();
  await page.getByLabel("Interface language").selectOption("es");await page.getByRole("textbox", { name: /Busca una palabra/ }).fill("pulpo");await clickEmoji(page, "pulpo");await page.getByRole("button", { name: "Abrir portal", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "La galería visual" })).toBeVisible();await page.getByRole("button", { name: /Ampliar imagen:/ }).first().click();
  await expect(page.getByRole("button", { name: "Cerrar imagen", exact: true })).toBeVisible();await expect(page.locator(".image-dialog").getByRole("link", { name: "Visitar museo" })).toBeVisible();
});
test("broken previews explain the failure and a changed subject replaces all image cards", async ({ page }) => {
  await stubArt(page);await page.route("https://openaccess-cdn.clevelandart.org/**", route => route.fulfill({ status: 404 }));await openArt(page);
  await expect(page.locator(".art-image-error").first()).toBeVisible();
  await page.locator(".topic-bar").getByRole("button", { name: "Ocean", exact: false }).click();
  await expect(page.locator(".artwork-card h4").first()).toHaveText("Ocean study 1");await expect(page.locator(".artwork-card h4").filter({ hasText: "Octopus" })).toHaveCount(0);
});

test("GIF gallery shows the top three relevant animations and refreshes them for a changed subject", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_GIPHY_API_KEY, "Run with a browser GIF key (requests are mocked).");
  const queries: string[] = [];
  await page.route("https://api.giphy.com/v1/gifs/search?**", async route => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q")!; queries.push(query);
    expect(url.searchParams.get("limit")).toBe("25");
    const item = (id: string, title: string, alt_text?: string) => ({
      id, title, alt_text, url: `https://giphy.com/gifs/${id}`,
      images: { fixed_width: { url: `https://media.giphy.com/${id}.gif`, frames: "10" } },
    });
    await route.fulfill({ json: { data: query === "Ocean" ? [item("ocean", "Ocean waves GIF"), item("old", "Octopus GIF")] : [
      item("off", "Dancing cat GIF"), item("related", "Octopi GIF"), item("first", "Octopus waving GIF"),
      item("second", "Octopus swimming GIF"), item("best", "Underwater GIF", "An octopus moves across the seafloor."),
      item("fourth", "Octopus resting GIF"),
    ] } });
  });
  await page.route("https://media.giphy.com/**", route => route.fulfill({
    contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
  }));
  await page.getByRole("textbox", { name: /Search a word/ }).fill("octopus");
  await clickEmoji(page, "octopus");
  await page.getByRole("button", { name: "Open portal", exact: true }).last().click();
  const cards = page.locator(".giphy-section .gif-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator("span")).toHaveText(["Underwater GIF", "Octopus waving GIF", "Octopus swimming GIF"]);
  await expect(page.locator(".giphy-credit")).toBeVisible();
  await page.locator(".topic-bar").getByRole("button", { name: "Ocean", exact: false }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.locator("span")).toHaveText(["Ocean waves GIF"]);
  expect(queries).toEqual(["Octopus", "Ocean"]);
  await page.getByRole("button", { name: "Close gallery", exact: true }).click();
  await expect(cards).toHaveCount(0);
});

test("artwork supports pointer-centered wheel zoom, maximum double-click zoom and drag panning", async ({ page }) => {
  await stubArt(page);await openArt(page);
  await page.getByRole("button", { name: "Expand image: Octopus study 1", exact: true }).click();
  const popup = page.locator(".image-dialog"), stage = popup.locator(".image-dialog-stage"), image = popup.locator("img");
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(900);
  const bounds = (await stage.boundingBox())!;
  const anchor = { x: bounds.x + bounds.width * .6, y: bounds.y + bounds.height * .55 };
  const initial = (await image.boundingBox())!;
  await page.mouse.move(anchor.x, anchor.y);await page.mouse.wheel(0, -120);
  await expect(popup.locator(".image-zoom-level")).toHaveText("127%");
  const enlarged = (await image.boundingBox())!;
  const ratio = enlarged.width / initial.width;
  expect(Math.abs(enlarged.x + (anchor.x - initial.x) * ratio - anchor.x)).toBeLessThan(2);
  expect(Math.abs(enlarged.y + (anchor.y - initial.y) * ratio - anchor.y)).toBeLessThan(2);
  await page.mouse.wheel(0, 60);await expect(popup.locator(".image-zoom-level")).toHaveText("113%");
  await page.mouse.dblclick(anchor.x, anchor.y);await expect(popup.locator(".image-zoom-level")).toHaveText("400%");
  await page.mouse.wheel(0, -5000);await expect(popup.locator(".image-zoom-level")).toHaveText("400%");
  const before = await stage.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  await page.mouse.move(anchor.x, anchor.y);await page.mouse.down();
  await page.mouse.move(anchor.x + 65, anchor.y + 40, { steps: 5 });
  await expect(stage).toHaveCSS("cursor", "grabbing");
  const after = await stage.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(Math.abs(after.left - (before.left - 65))).toBeLessThan(2);
  expect(Math.abs(after.top - (before.top - 40))).toBeLessThan(2);
  // Captured dragging continues outside the viewport and ends cleanly there.
  await page.mouse.move(bounds.x - 10, anchor.y, { steps: 5 });await page.mouse.up();
  await expect(stage).toHaveCSS("cursor", "grab");
  await page.mouse.dblclick(anchor.x, anchor.y);await expect(popup.locator(".image-zoom-level")).toHaveText("100%");
  expect(await stage.evaluate(el => el.scrollLeft === 0 && el.scrollTop === 0)).toBe(true);
  await page.mouse.wheel(0, 5000);await expect(popup.locator(".image-zoom-level")).toHaveText("100%");
  await page.mouse.dblclick(anchor.x, anchor.y);await page.keyboard.press("ArrowRight");
  await expect(popup.getByRole("heading")).toHaveText("Octopus study 2");
  await expect(popup.locator(".image-zoom-level")).toHaveText("100%");
  await popup.getByRole("button", { name: "Zoom in", exact: true }).click();
  await popup.getByRole("button", { name: "Fit image", exact: true }).click();
  await expect(popup.locator(".image-zoom-level")).toHaveText("100%");
});

async function stubKeyboardVideo(page: Page, delay = 0) {
  await page.route("**/api/discover", async route => {
    if (route.request().postDataJSON().provider !== "youtube") return route.fallback();
    await route.fulfill({ json: { status: "ready", items: [{ id: "keys", title: "Keyboard lesson", creator: "Teacher", sourceUrl: "https://www.youtube.com/watch?v=keys", embedUrl: "https://www.youtube-nocookie.com/embed/keys" }] } });
  });
  await page.route("https://www.youtube-nocookie.com/embed/keys**", route => route.fulfill({ contentType: "text/html", body: "<p>Keyboard lesson</p>" }));
  await page.route("https://www.youtube.com/iframe_api", async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await route.fulfill({ contentType: "text/javascript", body: `
      window.testPlayer = { state: 1, calls: [] };
      window.YT = { Player: class {
        constructor(iframe, options) { setTimeout(() => options.events.onReady({ target: this }), 0); }
        getPlayerState() { return window.testPlayer.state; }
        pauseVideo() { window.testPlayer.calls.push('pause'); window.testPlayer.state = 2; }
        playVideo() { window.testPlayer.calls.push('play'); window.testPlayer.state = 1; }
        destroy() { window.testPlayer.calls.push('destroy'); }
      } };
      window.onYouTubeIframeAPIReady();
    ` });
  });
  await page.getByRole("textbox", { name: /Search a word/ }).fill("octopus");
  await clickEmoji(page, "octopus");await page.getByRole("button", { name: "Open portal", exact: true }).first().click();
  await page.getByRole("button", { name: "Play video: Keyboard lesson", exact: true }).click();
}

test("video dialog Space toggles current playback and F toggles fullscreen without closing", async ({ page }) => {
  await stubKeyboardVideo(page);
  const popup = page.locator(".video-dialog"), screen = popup.locator(".video-dialog-screen");
  await expect(popup.locator("iframe")).toHaveAttribute("src", /enablejsapi=1/);
  const src = new URL((await popup.locator("iframe").getAttribute("src"))!);
  expect(src.searchParams.get("origin")).toBe(new URL(page.url()).origin);
  await expect.poll(() => page.evaluate(() => !!(window as any).testPlayer)).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.calls)).toEqual(["pause"]);
  await expect(popup).toBeVisible();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.calls)).toEqual(["pause", "play"]);
  // A pause through YouTube's own controls must also be reflected in the next shortcut.
  await page.evaluate(() => { (window as any).testPlayer.state = 2; });
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.calls)).toEqual(["pause", "play", "play"]);
  await page.keyboard.press("Control+f");expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe("video-dialog-screen");
  const viewport = page.viewportSize()!, fullscreen = (await screen.boundingBox())!;
  expect(fullscreen.width).toBe(viewport.width);expect(fullscreen.height).toBe(viewport.height);
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.state)).toBe(2);
  // Holding a key must not rapidly toggle playback or fullscreen.
  await page.keyboard.down("f");await page.keyboard.down("f");await page.keyboard.up("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.keyboard.down("Space");await page.keyboard.down("Space");await page.keyboard.up("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.state)).toBe(1);
  await popup.getByRole("button", { name: "Close video", exact: true }).click();
  await expect(popup).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).testPlayer.calls.at(-1))).toBe("destroy");
  await expect(page.getByRole("button", { name: "Play video: Keyboard lesson", exact: true })).toBeFocused();
  // Reopening reuses the loaded API, but creates a new player.
  await page.getByRole("button", { name: "Play video: Keyboard lesson", exact: true }).click();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer.state)).toBe(2);
  await page.keyboard.press("Escape");await expect(popup).toHaveCount(0);
});

test("Space pressed while the YouTube API loads pauses once the player is ready", async ({ page }) => {
  await stubKeyboardVideo(page, 800);
  await page.keyboard.press("Space");
  await expect(page.locator(".video-dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testPlayer?.calls)).toEqual(["pause"]);
  await page.keyboard.press("Escape");await expect(page.locator(".video-dialog")).toHaveCount(0);
});

test("art, sounds and GIFs load before Wikipedia resolves without duplicate searches", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_GIPHY_API_KEY, "Run with a browser GIF key (requests are mocked).");
  let resolveArticle!: () => void;
  const articleGate = new Promise<void>(resolve => { resolveArticle = resolve; });
  const counts: Record<string, number> = {};
  await page.route("**/api/resolve?**", async route => {
    await articleGate;
    const topic = {label:"Octopus",query:"Octopus",englishQuery:"Octopus",language:"en",wikiTitle:"Octopus"};
    await route.fulfill({json:{defaultTopic:topic,alternatives:[]}});
  });
  await page.route("**/api/discover", async route => {
    const {provider} = route.request().postDataJSON();
    counts[provider] = (counts[provider] || 0) + 1;
    if (provider === "art") return route.fulfill({json:{status:"ready",items:[{id:"art",title:"Early octopus art",sourceUrl:"https://clevelandart.org/art/1"}]}});
    if (provider === "freesound") return route.fulfill({json:{status:"ready",items:[{id:"sound",title:"Early underwater sound",sourceUrl:"https://freesound.org/s/1/"}]}});
    return route.fulfill({json:{status:"empty",items:[]}});
  });
  await page.route("https://api.giphy.com/v1/gifs/search?**", route => {
    counts.giphy = (counts.giphy || 0) + 1;
    return route.fulfill({json:{data:[{id:"gif",title:"Octopus GIF",url:"https://giphy.com/gifs/gif",images:{fixed_width:{url:"https://media.giphy.com/gif.gif"}}}]}});
  });
  await page.route("https://media.giphy.com/**", route => route.abort());
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");
  await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.getByText("Early octopus art",{exact:true})).toBeVisible();
  await expect(page.getByText("Early underwater sound",{exact:true})).toBeVisible();
  await expect(page.locator(".gif-card")).toHaveCount(1);
  expect(counts.wikipedia).toBeUndefined();
  resolveArticle();
  await expect(page.locator(".wikipedia-section")).toHaveAttribute("aria-busy","false");
  expect(counts.art).toBe(1);expect(counts.freesound).toBe(1);expect(counts.giphy).toBe(1);
});

test("starting a sound pauses the other sound and failed previews can retry", async ({ page }) => {
  await page.route("**/api/discover", async route => {
    if (route.request().postDataJSON().provider !== "freesound") return route.fallback();
    return route.fulfill({json:{status:"ready",items:[1,2].map(id=>({id:String(id),title:`Recording ${id}`,sourceUrl:`https://freesound.org/s/${id}/`,previewUrl:`https://media.example.test/${id}.wav`}))}});
  });
  await page.route("https://media.example.test/**", route => route.abort());
  await page.getByRole("textbox",{name:/Search a word/}).fill("octopus");
  await clickEmoji(page,"octopus");await page.getByRole("button",{name:"Open portal",exact:true}).first().click();
  await expect(page.locator("audio")).toHaveCount(2);
  // Dispatch the native playback event to verify coordination independently of codecs.
  const pauses = await page.locator("audio").evaluateAll(elements => {
    let paused = 0;
    (elements[0] as HTMLAudioElement).pause = () => { paused++; };
    elements[1].dispatchEvent(new Event("play"));
    return paused;
  });
  expect(pauses).toBe(1);
  await page.locator("audio").first().dispatchEvent("error");
  const card=page.locator(".sound-card").first();
  await expect(card.getByRole("status")).toBeVisible();
  await card.locator("audio").evaluate(el=>{(el as HTMLAudioElement).load=()=>{(el as HTMLAudioElement).dataset.retried="true";};});
  await card.getByRole("button",{name:"Try again",exact:true}).click();
  await expect(card.locator("audio")).toHaveAttribute("data-retried","true");
  await expect(card.getByRole("button",{name:"Try again",exact:true})).toHaveCount(0);
});
