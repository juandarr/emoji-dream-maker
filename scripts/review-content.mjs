import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require=createRequire(import.meta.url);
const data=require("emojibase-data/en/compact.json");
const glyphs=["🐙","🦋","🐋","🦊","🍓","🍋","🌙","🪐","🗼","🗽","🌋","🎨","🏃","🔭","🧠","😂","😴","❤️","♾️","🇨🇴","🎵"];
const results=[];
const base="http://127.0.0.1:3000";
for(let offset=0;offset<glyphs.length;offset+=2){
  await Promise.all(glyphs.slice(offset,offset+2).map(async glyph=>{
    const emoji=data.find(e=>e.unicode===glyph);
    const resolved=await fetch(`${base}/api/resolve?emojiId=${emoji.hexcode}&locale=en`,{signal:AbortSignal.timeout(6500)}).then(r=>r.json());
    const topic=resolved.defaultTopic;
    const lookups=await Promise.all(["wikipedia","art"].map(async provider=>{
      const result=await fetch(`${base}/api/discover`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({emojiId:emoji.hexcode,locale:"en",topic,provider}),signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      return {provider,status:result.status,reason:result.reason,items:result.items.map(item=>({title:item.title,sourceUrl:item.sourceUrl,excerpt:item.excerpt,license:item.license}))};
    }));
    results.push({glyph,emojiId:emoji.hexcode,label:emoji.label,topic,alternatives:resolved.alternatives.map(t=>t.label),lookups});
  }));
  await new Promise(resolve=>setTimeout(resolve,1200));
}
await writeFile("/tmp/emoji-content-review.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({glyph:r.glyph,label:r.label,subject:r.topic.label,alternatives:r.alternatives,wiki:r.lookups[0].status,art:r.lookups[1].items.map(i=>i.title),artStatus:r.lookups[1].status})),null,2));
