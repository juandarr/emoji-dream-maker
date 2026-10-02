export type Point={x:number;y:number};
export type Camera=Point & {zoom:number};
export const GLYPH_SIZE=40;
export const MIN_ZOOM=.1;
export const maxZoom=(width:number,height:number)=>Math.max(1,Math.min(width,height)/GLYPH_SIZE);
export function worldPoint(point:Point,camera:Camera):Point {
  return {x:(point.x-camera.x)/camera.zoom,y:(point.y-camera.y)/camera.zoom};
}
export function zoomAt(camera:Camera,point:Point,zoom:number):Camera {
  const world=worldPoint(point,camera);
  return {zoom,x:point.x-world.x*zoom,y:point.y-world.y*zoom};
}
export function fitCamera(points:Point[],width:number,height:number):Camera {
  if(!points.length)return {x:0,y:0,zoom:1};
  const minX=Math.min(...points.map(p=>p.x))-40,maxX=Math.max(...points.map(p=>p.x))+40;
  const minY=Math.min(...points.map(p=>p.y))-40,maxY=Math.max(...points.map(p=>p.y))+40;
  const zoom=Math.max(MIN_ZOOM,Math.min(1,(width-80)/(maxX-minX),(height-80)/(maxY-minY)));
  return {zoom,x:width/2-(minX+maxX)/2*zoom,y:height/2-(minY+maxY)/2*zoom};
}
