import {GLYPH_SIZE,type Point} from "./camera";
import type {BoardNode} from "./model";
import {rotatePoint,type Bounds,type WorldSize} from "./transforms";

/** Opaque horizontal runs in a normalized glyph square. Transparent holes remain empty. */
export type GlyphShape={size:number;rows:{left:number;right:number}[][];holes:{left:number;right:number}[][]};
export function shapeFromAlpha(alpha:Uint8Array,size:number):GlyphShape {
  const rows:GlyphShape["rows"]=[];
  for(let y=0;y<size;y++){
    const row:GlyphShape["rows"][number]=[];
    for(let x=0;x<size;){
      if(alpha[y*size+x]<16){x++;continue;}
      const left=x;while(x<size&&alpha[y*size+x]>=16)x++;
      row.push({left,right:x});
    }
    rows.push(row);
  }
  // Flood from the outside so a forgiving outer edge never fills enclosed holes.
  const exterior=new Uint8Array(size*size),queue=new Int32Array(size*size);let head=0,tail=0;
  function visit(i:number){if(!exterior[i]&&alpha[i]<16){exterior[i]=1;queue[tail++]=i;}}
  for(let i=0;i<size;i++){visit(i);visit((size-1)*size+i);visit(i*size);visit(i*size+size-1);}
  while(head<tail){const i=queue[head++],x=i%size,y=Math.floor(i/size);if(x)visit(i-1);if(x<size-1)visit(i+1);if(y)visit(i-size);if(y<size-1)visit(i+size);}
  const holes:GlyphShape["holes"]=[];
  for(let y=0;y<size;y++){
    const row:GlyphShape["holes"][number]=[];
    for(let x=0;x<size;){if(alpha[y*size+x]>=16||exterior[y*size+x]){x++;continue;}const left=x;while(x<size&&alpha[y*size+x]<16&&!exterior[y*size+x])x++;row.push({left,right:x});}
    holes.push(row);
  }
  return {size,rows,holes};
}
function shapePoint(node:BoardNode,p:Point,world:WorldSize,size:number):Point {
  const local=rotatePoint({x:p.x-node.x/100*world.width,y:p.y-node.y/100*world.height},-node.rotation);
  const units=size/(GLYPH_SIZE*node.scale);
  return {x:local.x*units+size/2,y:local.y*units+size/2};
}
/** About 12% wider at ordinary sizes, bounded in screen pixels through zoom. */
export function pointerEdgeTolerance(scale:number,zoom:number,pointerType:string):number {
  const touch=pointerType==="touch",pixels=Math.max(touch?4:2,Math.min(touch?10:6,GLYPH_SIZE*scale*zoom*.06));
  return pixels/zoom;
}
export function pointInShape(node:BoardNode,p:Point,world:WorldSize,shape:GlyphShape,tolerance=0):boolean {
  const local=shapePoint(node,p,world,shape.size),row=shape.rows[Math.floor(local.y)];
  if(row?.some(run=>local.x>=run.left&&local.x<run.right))return true;
  if(tolerance<=0||shape.holes[Math.floor(local.y)]?.some(run=>local.x>=run.left&&local.x<run.right))return false;
  const radius=tolerance*shape.size/(GLYPH_SIZE*node.scale),radiusSquared=radius*radius;
  const first=Math.max(0,Math.floor(local.y-radius)),last=Math.min(shape.size-1,Math.floor(local.y+radius));
  for(let y=first;y<=last;y++){
    const dy=Math.max(y-local.y,local.y-y-1,0);
    for(const run of shape.rows[y]){const dx=Math.max(run.left-local.x,local.x-run.right,0);if(dx*dx+dy*dy<=radiusSquared)return true;}
  }
  return false;
}
/** Test each painted run against the inverse-transformed area, including edge contact. */
export function shapeIntersectsArea(node:BoardNode,area:Bounds,world:WorldSize,shape:GlyphShape,tolerance=0):boolean {
  const polygon=[{x:area.left,y:area.top},{x:area.right,y:area.top},{x:area.right,y:area.bottom},{x:area.left,y:area.bottom}].map(p=>shapePoint(node,p,world,shape.size));
  const epsilon=tolerance*shape.size/(GLYPH_SIZE*node.scale);
  const axes=[{x:1,y:0},{x:0,y:1},rotatePoint({x:1,y:0},-node.rotation),rotatePoint({x:0,y:1},-node.rotation)];
  const projections=axes.map(axis=>{const values=polygon.map(p=>p.x*axis.x+p.y*axis.y);return {axis,min:Math.min(...values),max:Math.max(...values)};});
  const top=Math.max(0,Math.ceil(projections[1].min-epsilon)-1),bottom=Math.min(shape.size-1,Math.floor(projections[1].max+epsilon));
  for(let y=top;y<=bottom;y++)for(const run of shape.rows[y]){
    if(run.right+epsilon<projections[0].min||run.left-epsilon>projections[0].max)continue;
    if(projections.every(({axis,min,max})=>{
      const center=(run.left+run.right)/2*axis.x+(y+.5)*axis.y;
      const radius=(run.right-run.left)/2*Math.abs(axis.x)+.5*Math.abs(axis.y);
      return center+radius+epsilon>=min&&center-radius-epsilon<=max;
    }))return true;
  }
  return false;
}
