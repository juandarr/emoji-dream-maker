import {describe,expect,it} from "vitest";
import {boundedZoom,fitCamera,resizeCamera,resizeScale,steppedZoom,worldPoint,zoomAt} from "@/features/playground/camera";
import {emptyComposition,parseComposition} from "@/features/playground/model";
import {emojiById} from "@/lib/catalog";
import {createNode} from "@/features/playground/model";
describe("canvas camera",()=>{
  it("keeps the world point under the cursor stationary when zooming",()=>{
    const camera={x:-230,y:170,zoom:2},cursor={x:380,y:220};
    expect(worldPoint(cursor,zoomAt(camera,cursor,5))).toEqual(worldPoint(cursor,camera));
  });
  it("limits zoom relative to the fitted view for tiny and expansive compositions",()=>{
    for(const reference of [.00015,1,15]){
      expect(boundedZoom(reference*100,reference)/reference).toBeCloseTo(8);
      expect(boundedZoom(reference*.001,reference)/reference).toBeCloseTo(.1);
      expect(boundedZoom(reference*1.5,reference)/reference).toBeCloseTo(1.5);
    }
  });
  it("steps through predictable percentages around the fitted 100% view",()=>{
    expect(steppedZoom(1,1)).toBe(1.25);expect(steppedZoom(1.25,1)).toBe(1.5);
    expect(steppedZoom(1.5,-1)).toBe(1.25);expect(steppedZoom(1.25,-1)).toBe(1);
    expect(steppedZoom(1.37,1)).toBe(1.5);expect(steppedZoom(1.37,-1)).toBe(1.25);
    expect(steppedZoom(.1,-1)).toBe(.1);expect(steppedZoom(8,1)).toBe(8);
  });
  it("finds objects after panning beyond the original board",()=>{
    const points=[{x:-500,y:1200},{x:-450,y:1500}],camera=fitCamera(points,800,600);
    for(const point of points){expect(point.x*camera.zoom+camera.x).toBeGreaterThan(0);expect(point.x*camera.zoom+camera.x).toBeLessThan(800);expect(point.y*camera.zoom+camera.y).toBeGreaterThan(0);expect(point.y*camera.zoom+camera.y).toBeLessThan(600);}
  });
  it("round-trips objects outside the original percentage rectangle",()=>{
    const board=emptyComposition();board.nodes=[createNode(emojiById.get("2764")!,"en","outside",0,{x:-300,y:700})];
    expect(parseComposition(JSON.parse(JSON.stringify(board)))).toEqual(board);
    expect(()=>parseComposition({...board,nodes:[{...board.nodes[0],x:NaN}]})).toThrow();
  });
  it("restores zoom and the center after repeated changes in viewport aspect ratio",()=>{
    const world={width:900,height:550},original={x:-70,y:35,zoom:1.3};
    const desktop={width:900,height:550},phone={width:350,height:480};
    let camera=original,reference=1;
    for(let cycle=0;cycle<5;cycle++){
      camera=resizeCamera(camera,desktop,phone,world);reference*=resizeScale(desktop,phone,world);
      camera=resizeCamera(camera,phone,desktop,world);reference*=resizeScale(phone,desktop,world);
    }
    expect(camera.zoom).toBeCloseTo(original.zoom);
    expect(camera.x).toBeCloseTo(original.x);expect(camera.y).toBeCloseTo(original.y);
    expect(reference).toBeCloseTo(1);
  });
});
