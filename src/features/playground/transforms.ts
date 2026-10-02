import {clamp,type BoardNode} from "./model";
import {GLYPH_SIZE,type Point} from "./camera";

export type WorldSize={width:number;height:number};
export type Bounds={left:number;top:number;right:number;bottom:number};
export const centerOf=(b:Bounds):Point=>({x:(b.left+b.right)/2,y:(b.top+b.bottom)/2});
export const normalizeRotation=(angle:number)=>(angle%360+360)%360;
export function nodeBounds(node:BoardNode,world:WorldSize):Bounds {
  const angle=node.rotation*Math.PI/180;
  const radius=GLYPH_SIZE*node.scale/2*(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle)));
  const x=node.x/100*world.width,y=node.y/100*world.height;
  return {left:x-radius,right:x+radius,top:y-radius,bottom:y+radius};
}
export function selectionBounds(nodes:BoardNode[],world:WorldSize):Bounds|null {
  if(!nodes.length)return null;
  const boxes=nodes.map(n=>nodeBounds(n,world));
  return {left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))};
}
export type SelectionFrame={center:Point;width:number;height:number;rotation:number};
export function rotatePoint(point:Point,angle:number):Point {
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  return {x:point.x*c-point.y*s,y:point.x*s+point.y*c};
}
export function nodeCorners(node:BoardNode,world:WorldSize):Point[] {
  const half=GLYPH_SIZE*node.scale/2,center={x:node.x/100*world.width,y:node.y/100*world.height};
  return [{x:-half,y:-half},{x:half,y:-half},{x:half,y:half},{x:-half,y:half}].map(p=>{const q=rotatePoint(p,node.rotation);return {x:center.x+q.x,y:center.y+q.y};});
}
/** Project onto the first object's axes: a rigid group rotation preserves this frame. */
export function selectionFrame(nodes:BoardNode[],world:WorldSize):SelectionFrame|null {
  if(!nodes.length)return null;
  const rotation=nodes[0].rotation;
  const points=nodes.flatMap(n=>nodeCorners(n,world)).map(p=>rotatePoint(p,-rotation));
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
  const top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  return {center:rotatePoint({x:(left+right)/2,y:(top+bottom)/2},rotation),width:right-left,height:bottom-top,rotation};
}
/** Inclusive separating-axis overlap avoids selecting empty corners of rotated bounding boxes. */
export function intersectedNodes(nodes:BoardNode[],area:Bounds,world:WorldSize,tolerance=1e-7):string[] {
  const rectangle=[{x:area.left,y:area.top},{x:area.right,y:area.top},{x:area.right,y:area.bottom},{x:area.left,y:area.bottom}];
  return nodes.filter(n=>{
    const corners=nodeCorners(n,world);
    return [0,90,n.rotation,n.rotation+90].every(angle=>{
      const axis=rotatePoint({x:1,y:0},angle),project=(p:Point)=>p.x*axis.x+p.y*axis.y;
      const a=corners.map(project),b=rectangle.map(project);
      return Math.max(...a)+tolerance>=Math.min(...b)&&Math.max(...b)+tolerance>=Math.min(...a);
    });
  }).map(n=>n.id);
}
export function resizeCursor(rotation:number):string {
  return ["nwse-resize","ns-resize","nesw-resize","ew-resize"][Math.round(normalizeRotation(rotation)/45)%4];
}
/** Transform positions in world pixels so non-square canvases preserve angles and proportions. */
export function transformNodes(nodes:BoardNode[],world:WorldSize,center:Point,{dx=0,dy=0,factor=1,angle=0}:{dx?:number;dy?:number;factor?:number;angle?:number}):BoardNode[] {
  const ratio=Math.max(...nodes.map(n=>.2/n.scale),Math.min(factor,...nodes.map(n=>12/n.scale)));
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  return nodes.map(n=>{
    const x=(n.x/100*world.width-center.x)*ratio,y=(n.y/100*world.height-center.y)*ratio;
    return {...n,x:clamp((center.x+x*c-y*s+dx)/world.width*100),y:clamp((center.y+x*s+y*c+dy)/world.height*100),scale:Math.max(.2,Math.min(12,n.scale*ratio)),rotation:normalizeRotation(n.rotation+angle)};
  });
}
