import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require=createRequire(import.meta.url), data=require("emojibase-data/en/compact.json");
const glyphs=["😊","🤔","🧘","☕","❤️","👍","🐶","🐙","🔥","😡","😢","🧠","💡","📚","🌊","🗼","🗽","🎨","🏃","♾️","🌸","🇨🇴"];
const results=[];
for(let i=0;i<glyphs.length;i++){
  const glyph=glyphs[i],emoji=data.find(e=>e.unicode.replaceAll('\uFE0F','')===glyph.replaceAll('\uFE0F','')),locale=i%2?'es':'en',start=Date.now();
  const resolved=await fetch(`http://127.0.0.1:3000/api/resolve?emojiId=${emoji.hexcode}&locale=${locale}`).then(r=>r.json());
  const result=await fetch('http://127.0.0.1:3000/api/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({emojiId:emoji.hexcode,locale,topic:resolved.defaultTopic,provider:'wikipedia'})}).then(r=>r.json());
  const row={glyph,locale,topic:resolved.defaultTopic.label,status:result.status,reason:result.reason,title:result.items[0]?.title,excerpt:result.items[0]?.excerpt,language:result.items[0]?.language,ms:Date.now()-start};
  if(result.items[0]&&i%4===0)row.related=await fetch(`http://127.0.0.1:3000/api/related?title=${encodeURIComponent(row.title)}&locale=${row.language}`).then(r=>r.json());
  results.push(row);console.log(JSON.stringify({...row,excerpt:row.excerpt?.slice(0,100),related:row.related&&{status:row.related.status,titles:row.related.topics.map(t=>t.label)}}));
  await new Promise(resolve=>setTimeout(resolve,600));
}
await writeFile('/tmp/emoji-wikipedia-review.json',JSON.stringify(results,null,2));
