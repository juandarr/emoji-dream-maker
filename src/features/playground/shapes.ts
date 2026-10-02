import {GLYPH_SIZE,type Point} from "./camera";
import type {BoardNode} from "./model";
import {rotatePoint,type Bounds,type WorldSize} from "./transforms";

/** Opaque horizontal runs in a normalized glyph square. Transparent holes remain empty. */
export type GlyphShape={size:number;rows:{left:number;right:number}[][]};
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
  return {size,rows};
}
function shapePoint(node:BoardNode,p:Point,world:WorldSize,size:number):Point {
  const local=rotatePoint({x:p.x-node.x/100*world.width,y:p.y-node.y/100*world.height},-node.rotation);
  const units=size/(GLYPH_SIZE*node.scale);
  return {x:local.x*units+size/2,y:local.y*units+size/2};
}
export function pointInShape(node:BoardNode,p:Point,world:WorldSize,shape:GlyphShape):boolean {
  const local=shapePoint(node,p,world,shape.size),row=shape.rows[Math.floor(local.y)];
  return !!row?.some(run=>local.x>=run.left&&local.x<run.right);
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
