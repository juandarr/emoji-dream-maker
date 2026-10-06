import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const board = {schemaVersion:1,title:"",intent:"",interpretation:"",edges:[],nodes:[
  {id:"heart",emojiId:"2764",glyph:"❤️",label:"red heart",meaning:"Love",note:"",role:"subject",x:45,y:45,scale:1,rotation:0},
  {id:"moon",emojiId:"1F319",glyph:"🌙",label:"crescent moon",meaning:"A childhood memory",note:"",role:"setting",x:65,y:30,scale:1,rotation:0},
]};
const copy = {
  en:{language:"Interface language",workspace:"Playground",discover:"Discover",favorites:"Favorites",history:"History",grid:"Grid",list:"List",constellation:"Constellation",search:"Search a word, feeling, or emoji…",emoji:"octopus",portal:"Open portal",close:"Close gallery",save:"Save discovery",clear:"Clear all",undoClear:"Undo clear",context:"Add context",relationships:"Add relationships",settings:"Settings",picker:"Open emoji picker",pickerClose:"Close emoji picker",pickerSearch:"Search emojis in English or Spanish",format:"Make a",meaning:"Chosen meaning",model:"Text model",reasoning:"Reasoning effort",summary:"Generation summary",generate:"Generate",reader:"Open reading view",readerClose:"Close reading view",closeNotice:"Dismiss notice",details:"Creation details",edit:"Edit output",done:"Done editing",brief:"Edit the canvas interpretation",copy:"Copy brief",layers:"Layers",closeLayers:"Close layers",arrange:"Arrange",fullscreen:"Enter fullscreen",exitFullscreen:"Exit fullscreen",formats:["Interpretation","Short message","Poem","Short story","Song lyrics","Image prompt","Video storyboard"]},
  es:{language:"Idioma de la interfaz",workspace:"Espacio creativo",discover:"Descubrir",favorites:"Favoritos",history:"Historial",grid:"Cuadrícula",list:"Lista",constellation:"Constelación",search:"Busca una palabra, emoción o emoji…",emoji:"pulpo",portal:"Abrir portal",close:"Cerrar galería",save:"Guardar descubrimiento",clear:"Borrar todo",undoClear:"Deshacer borrado",context:"Añadir contexto",relationships:"Añadir relaciones",settings:"Ajustes",picker:"Abrir selector de emojis",pickerClose:"Cerrar selector de emojis",pickerSearch:"Busca emojis en inglés o español",format:"Crear un(a)",meaning:"Significado elegido",model:"Modelo de texto",reasoning:"Nivel de razonamiento",summary:"Resumen de generación",generate:"Generar",reader:"Abrir vista de lectura",readerClose:"Cerrar vista de lectura",closeNotice:"Cerrar aviso",details:"Detalles de la creación",edit:"Editar resultado",done:"Terminar de editar",brief:"Editar la interpretación del lienzo",copy:"Copiar interpretación",layers:"Capas",closeLayers:"Cerrar capas",arrange:"Organizar",fullscreen:"Pantalla completa",exitFullscreen:"Salir de pantalla completa",formats:["Interpretación","Mensaje corto","Poema","Cuento corto","Letra de canción","Descripción para imagen","Guion de video"]},
};
async function fixtures(page:Page){
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort());
  await page.route("https://api.giphy.com/**",r=>r.fulfill({json:{data:[]}}));
  await page.route("https://www.youtube.com/iframe_api",r=>r.abort());
  await page.route("https://www.youtube-nocookie.com/embed/**",r=>r.fulfill({contentType:"text/html",body:"<p>Video fixture</p>"}));
  await page.route("https://audit.example/**",r=>r.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#304e6b"/></svg>'}));
  await page.route("**/api/resolve?**",r=>{
    const es=new URL(r.request().url()).searchParams.get("locale")==="es";
    const topic={label:es?"Pulpo":"Octopus",query:es?"Pulpo":"Octopus",englishQuery:"Octopus",wikiTitle:es?"Pulpo":"Octopus",language:es?"es":"en"};
    return r.fulfill({json:{defaultTopic:topic,alternatives:[]}});
  });
  await page.route("**/api/related?**",r=>r.fulfill({json:{status:"empty",topics:[]}}));
  await page.route("**/api/discover",r=>{
    const {provider,locale}=r.request().postDataJSON(),es=locale==="es";
    const items = provider==="wikipedia"?[{id:"wiki",title:"Octopus",excerpt:"An octopus is a sea animal.",sourceUrl:"https://en.wikipedia.org/wiki/Octopus",language:"en",license:"CC BY-SA"}]
      :provider==="art"?[{id:"art",title:"Octopus study",sourceUrl:"https://audit.example/art",previewUrl:"https://audit.example/preview.svg",imageUrl:"https://audit.example/full.svg",license:"CC0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",collection:"Museum"}]
      :provider==="youtube"?[{id:"video",title:"Octopus lesson",creator:"Teacher",sourceUrl:"https://www.youtube.com/watch?v=fixture",previewUrl:"https://audit.example/video.svg",embedUrl:"https://www.youtube-nocookie.com/embed/fixture"}]
      :[{id:"sound",title:es?"Sonidos del océano":"Ocean sounds",sourceUrl:"https://audit.example/sound",creator:"Sound artist",license:"CC0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",soundConnection:{label:es?"Océano":"Ocean",kind:"evocative"}}];
    return r.fulfill({json:{status:"ready",items}});
  });
  await page.route("**/api/generations",r=>r.request().method()==="GET"?r.fulfill({json:{configured:true,models:["test/text"],maxOutputTokens:8192}}):r.fulfill({json:{result:{title:r.request().postDataJSON().settings.locale==="es"?"Una pequeña idea":"A little idea",text:r.request().postDataJSON().settings.locale==="es"?"La luna acompaña a un corazón curioso.":"The moon accompanies a curious heart.",model:"test/text",provider:"openrouter",usage:{promptTokens:100,completionTokens:20,cost:0.001}}}}));
}
async function start(page:Page,locale:"en"|"es"){
  await fixtures(page);await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");
  await expect(page.getByLabel("Interface language")).toBeEnabled();
  if(locale==="es")await page.getByLabel("Interface language").selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang",locale);
}
async function accessible(page:Page,scope?:string,ignoreConstellationOverlap=false){
  let builder=new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).exclude("nextjs-portal");
  if(scope)builder=builder.include(scope);
  const report=await builder.analyze();
  // The user explicitly requested the original orbits and accepted their overlap.
  // Ignore only target-size findings on those constellation buttons.
  if(ignoreConstellationOverlap){
    for(const violation of report.violations.filter(v=>v.id==="target-size")){
      const remaining=[];
      for(const node of violation.nodes){
        const target=node.target[0];
        if(typeof target!=="string"||!await page.locator(target).evaluate(el=>!!el.closest(".dream-canvas.constellation .emoji-field")))remaining.push(node);
      }
      violation.nodes=remaining;
    }
    report.violations=report.violations.filter(v=>v.nodes.length);
  }
  expect(report.violations.map(v=>({id:v.id,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
}
async function openWorkspace(page:Page,locale:"en"|"es"){
  const t=copy[locale];await page.getByRole("button",{name:t.workspace,exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles({name:"scene.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(board))});
  await expect(page.locator(".pg-node")).toHaveCount(2);
}
for(const locale of ["en","es"] as const)test(`${locale}: missing page uses the saved language and returns to discovery`,async({page})=>{
  await start(page,locale);
  const response=await page.goto("/missing-audit-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await expect(page.getByRole("heading",{level:1})).toHaveText(locale==="es"?"Página no encontrada":"Page not found");
  await accessible(page);
  await page.getByRole("link",{name:locale==="es"?"Volver a descubrir":"Return to Discover"}).click();
  await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await expect(page.getByRole("button",{name:copy[locale].workspace,exact:true})).toBeVisible();
});
for(const locale of ["en","es"] as const){
  const t=copy[locale];
  test(`${locale}: discovery views, gallery, artwork, video, saved lists and keyboard focus`,async({page})=>{
    await start(page,locale);
    for(const view of [t.constellation,t.grid,t.list]){
      await page.getByRole("button",{name:view,exact:true}).click();await accessible(page,undefined,view===t.constellation);
    }
    await page.getByRole("textbox",{name:t.search,exact:true}).fill(t.emoji);
    await expect(page.locator(".canvas-toolbar")).toContainText(locale==="es"?"1 emoji para explorar":"1 emoji to explore");
    await page.getByLabel(t.emoji,{exact:true}).press("Enter");
    const trigger=page.getByRole("button",{name:t.portal,exact:true}).last();await trigger.click();
    await expect(page.locator(".wikipedia-section")).toHaveAttribute("aria-busy","false");
    await expect(page.locator(".wiki-content p")).toHaveAttribute("lang","en");
    if(locale==="es")await expect(page.locator(".fallback-badge")).toHaveText("Contexto en inglés");
    await accessible(page,".gallery");
    await page.getByRole("button",{name:`${locale==="es"?"Ampliar imagen":"Expand image"}: Octopus study`,exact:true}).click();
    await accessible(page,".image-dialog");await page.keyboard.press("Escape");
    await page.getByRole("button",{name:`${locale==="es"?"Reproducir video":"Play video"}: Octopus lesson`,exact:true}).click();
    await accessible(page,".video-dialog");
    await page.getByRole("button",{name:locale==="es"?"Cerrar video":"Close video",exact:true}).press("Space");
    await expect(page.locator(".video-dialog")).toHaveCount(0);
    await page.getByRole("button",{name:t.save,exact:true}).click();
    await page.getByRole("button",{name:t.close,exact:true}).click();await expect(trigger).toBeFocused();
    for(const tab of [t.favorites,t.history]){
      await page.getByRole("button",{name:new RegExp(`^${tab}`)}).click();await expect(page.locator(".saved-card")).toHaveCount(1);await accessible(page);
      await page.getByRole("button",{name:t.clear,exact:true}).click();await expect(page.locator(".saved-card")).toHaveCount(0);
      await page.getByRole("button",{name:t.undoClear,exact:true}).click();await expect(page.locator(".saved-card")).toHaveCount(1);
    }
    await page.reload();await expect(page.getByRole("button",{name:t.workspace,exact:true})).toBeVisible();
  });
  test(`${locale}: creative controls, formats, symbols, generation, details and reading modal`,async({page})=>{
    await start(page,locale);await openWorkspace(page,locale);await accessible(page);
    await expect(page.getByLabel(t.format,{exact:true}).locator("option")).toHaveText(t.formats);
    for(const kind of ["interpretation","message","poem","story","lyrics","image-prompt","storyboard"]){
      await page.getByLabel(t.format,{exact:true}).selectOption(kind);await expect(page.locator("#pg-format-description")).not.toBeEmpty();
    }
    await page.getByRole("button",{name:t.relationships,exact:true}).click();await page.locator(".pg-node").first().press("Enter");
    await expect(page.getByLabel(t.meaning,{exact:true})).toHaveValue(locale==="es"?"Amor":"Love");
    await page.getByLabel(t.meaning,{exact:true}).fill("Love");await page.getByLabel(t.meaning,{exact:true}).press("Tab");
    await page.getByRole("button",{name:t.settings,exact:true}).click();await expect(page.getByLabel(t.model,{exact:true})).toHaveValue("test/text");
    await page.getByLabel(t.reasoning,{exact:true}).selectOption("high");await accessible(page);
    await page.getByRole("button",{name:t.summary,exact:true}).click();await accessible(page,"#pg-generation-summary");await page.keyboard.press("Escape");
    await page.getByRole("button",{name:t.layers,exact:true}).click();await accessible(page,"#pg-layers");await page.getByRole("button",{name:t.closeLayers,exact:true}).click();
    await page.getByRole("button",{name:t.arrange,exact:true}).click();await accessible(page,".pg-arrange");await page.keyboard.press("Escape");
    await page.getByRole("button",{name:t.picker,exact:true}).click();await accessible(page,".pg-floating-library");
    await page.getByLabel(t.pickerSearch).fill(t.emoji);await page.getByRole("button",{name:`${locale==="es"?"Añadir":"Add"} ${t.emoji}`,exact:true}).press("Enter");await expect(page.locator(".pg-node")).toHaveCount(3);
    await page.getByRole("button",{name:t.pickerClose,exact:true}).click();
    await page.getByRole("button",{name:t.fullscreen,exact:true}).click();await expect(page.getByRole("button",{name:t.exitFullscreen,exact:true})).toBeVisible();await page.getByRole("button",{name:t.exitFullscreen,exact:true}).click();
    await page.getByRole("button",{name:t.generate,exact:true}).click();await expect(page.locator(".pg-output .pg-story-prose")).toBeVisible();
    await page.locator(".pg-output").getByText(t.details,{exact:true}).click();
    await expect(page.locator(".pg-output .pg-story-details")).toContainText(locale==="es"?"Tokens de entrada: 100":"Input tokens: 100");
    await accessible(page);
    await page.getByRole("button",{name:t.reader,exact:true}).click();await accessible(page,".pg-reader");
    await page.locator(".pg-reader").getByRole("button",{name:t.edit,exact:true}).click();await accessible(page,".pg-reader");
    await page.locator(".pg-reader").getByRole("button",{name:t.done,exact:true}).click();await page.keyboard.press("Escape");
    await expect(page.getByRole("button",{name:t.reader,exact:true})).toBeFocused();
    await page.locator('input[type="file"]').setInputFiles({name:"bad.json",mimeType:"application/json",buffer:Buffer.from("{}")});
    await expect(page.getByRole("button",{name:t.closeNotice,exact:true})).toBeVisible();await page.getByRole("button",{name:t.closeNotice,exact:true}).click();
    if(locale==="es"){
      await page.getByLabel(t.language).selectOption("en");await page.getByRole("button",{name:copy.en.relationships,exact:true}).click();await page.getByRole("button",{name:copy.en.relationships,exact:true}).click();
      await page.locator(".pg-node").first().press("Enter");await expect(page.getByLabel(copy.en.meaning,{exact:true})).toHaveValue("Love");
      await expect(page.locator(".pg-output .pg-story-prose")).toHaveAttribute("lang","es");
    }
  });
  test(`${locale}: responsive layouts stay usable at 320 and 390 pixels`,async({page})=>{
    await start(page,locale);
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});await page.getByRole("button",{name:t.discover,exact:true}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.getByRole("button",{name:t.workspace,exact:true}).click();
      await page.getByRole("button",{name:t.relationships,exact:true}).click();await page.getByRole("button",{name:t.settings,exact:true}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await accessible(page);
      await page.getByRole("button",{name:t.picker,exact:true}).click();await expect(page.getByLabel(t.pickerSearch)).toBeFocused();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await accessible(page,".pg-floating-library");
      await page.keyboard.press("Escape");
    }
  });
}
test("failure messages switch languages and stay translated after reloading",async({page})=>{
  await start(page,"es");await openWorkspace(page,"es");
  await page.route("**/api/generations",r=>r.request().method()==="GET"?r.fallback():r.fulfill({status:502,json:{code:"credits",error:"OpenRouter needs credits or a higher key budget."}}));
  await page.getByRole("button",{name:"Generar",exact:true}).click();
  await expect(page.locator(".pg-header-issue")).toHaveText("OpenRouter necesita créditos o un presupuesto mayor para la clave.");
  await page.getByLabel("Idioma de la interfaz").selectOption("en");await expect(page.locator(".pg-header-issue")).toHaveText("OpenRouter needs credits or a higher key budget.");
  await page.getByLabel("Interface language").selectOption("es");await page.reload();await page.getByRole("button",{name:"Espacio creativo",exact:true}).click();
  await expect(page.locator(".pg-header-issue")).toHaveText("OpenRouter necesita créditos o un presupuesto mayor para la clave.");
});
test("device reduced motion has an accurate disabled preference and keyboard skip link",async({page})=>{
  await start(page,"es");await expect(page.getByRole("button",{name:"Reducir movimiento",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Reducir movimiento",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("link",{name:"Saltar al contenido principal",exact:true}).focus();await page.keyboard.press("Enter");await expect(page.locator("#main-content")).toBeFocused();
});
