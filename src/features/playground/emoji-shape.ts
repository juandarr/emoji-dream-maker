import {shapeFromAlpha,type GlyphShape} from "./shapes";

const SIZE=512;
const cache=new Map<string,GlyphShape>();
/** Hit testing only: the displayed artwork stays a vector font, never this bitmap. */
export function emojiShape(glyph:string,fontFamily:string):GlyphShape|null {
  const key=`${document.fonts.check('32px "Playground Noto Emoji"',glyph)}:${fontFamily}:${glyph}`,saved=cache.get(key);if(saved)return saved;
  const canvas=document.createElement("canvas");canvas.width=canvas.height=SIZE;
  const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)return null;
  // Match the centered CSS line box and Noto's 1275/1024-em advance exactly.
  context.font=`${SIZE*1024/1275}px ${fontFamily}`;
  // CSS text baselines can differ from canvas font metrics by a fractional pixel.
  // Measure an invisible copy of the same centered line box once per glyph.
  const sample=document.createElement("span"),line=document.createElement("span"),baseline=document.createElement("span");
  sample.setAttribute("aria-hidden","true");
  sample.style.cssText=`position:fixed;left:-10000px;top:0;width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;visibility:hidden;pointer-events:none`;
  line.style.font=context.font;line.style.lineHeight="1";
  line.append(document.createTextNode(glyph));baseline.style.cssText="display:inline-block;width:0;height:0;vertical-align:baseline";line.append(baseline);sample.append(line);document.body.append(sample);
  try{
    const box=sample.getBoundingClientRect(),text=line.getBoundingClientRect();
    context.fillText(glyph,(SIZE-text.width)/2,baseline.getBoundingClientRect().top-box.top);
  }finally{sample.remove();}
  const pixels=context.getImageData(0,0,SIZE,SIZE).data,alpha=new Uint8Array(SIZE*SIZE);
  for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
  const shape=shapeFromAlpha(alpha,SIZE);
  if(cache.size>=256)cache.delete(cache.keys().next().value!);
  if(document.fonts.status==="loaded")cache.set(key,shape);return shape;
}
