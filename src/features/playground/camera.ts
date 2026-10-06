export type Point={x:number;y:number};
export type Camera=Point & {zoom:number};
export const GLYPH_SIZE=40;
export const MIN_ZOOM=.1;
export const MAX_ZOOM=8;
export const ZOOM_STEPS=[.1,.25,.5,.75,1,1.25,1.5,2,3,4,6,8];
/** Limits are relative to the user's fitted 100% view, not the world unit scale. */
export function boundedZoom(zoom:number,reference:number):number {
  return Math.max(reference*MIN_ZOOM,Math.min(reference*MAX_ZOOM,zoom));
}
export function steppedZoom(relative:number,direction:1|-1):number {
  return direction===1?ZOOM_STEPS.find(step=>step>relative+1e-8)??MAX_ZOOM:[...ZOOM_STEPS].reverse().find(step=>step<relative-1e-8)??MIN_ZOOM;
}
export function worldPoint(point:Point,camera:Camera):Point {
  return {x:(point.x-camera.x)/camera.zoom,y:(point.y-camera.y)/camera.zoom};
}
export function zoomAt(camera:Camera,point:Point,zoom:number):Camera {
  const world=worldPoint(point,camera);
  return {zoom,x:point.x-world.x*zoom,y:point.y-world.y*zoom};
}
export function fitCamera(points:Point[],width:number,height:number):Camera {
  if(!points.length)return {x:0,y:0,zoom:1};
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  // Tiny and distant compositions must both fit: don't clamp an explicit fit
  // to the ordinary wheel-zoom limits, which can leave objects outside view.
  const zoom=Math.min(width*.95/Math.max(1,maxX-minX),height*.95/Math.max(1,maxY-minY));
  return {zoom,x:width/2-(minX+maxX)/2*zoom,y:height/2-(minY+maxY)/2*zoom};
}
/** Preserve the center world point and scale uniformly with the available viewport. */
export function resizeCamera(camera:Camera,previous:{width:number;height:number},next:{width:number;height:number}):Camera {
  const center=worldPoint({x:previous.width/2,y:previous.height/2},camera);
  const zoom=camera.zoom*Math.min(next.width/previous.width,next.height/previous.height);
  return {zoom,x:next.width/2-center.x*zoom,y:next.height/2-center.y*zoom};
}
