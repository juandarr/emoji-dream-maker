import {describe,expect,it} from "vitest";
import {fitCamera,maxZoom,worldPoint,zoomAt,GLYPH_SIZE} from "@/features/playground/camera";
import {emptyComposition,parseComposition} from "@/features/playground/model";
import {emojiById} from "@/lib/catalog";
import {createNode} from "@/features/playground/model";
describe("canvas camera",()=>{
  it("keeps the world point under the cursor stationary when zooming",()=>{
    const camera={x:-230,y:170,zoom:2},cursor={x:380,y:220};
    expect(worldPoint(cursor,zoomAt(camera,cursor,5))).toEqual(worldPoint(cursor,camera));
  });
  it("limits the glyph to the shorter viewport dimension",()=>{
    for(const [width,height] of [[390,600],[1400,850]])expect(maxZoom(width,height)*GLYPH_SIZE).toBe(Math.min(width,height));
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
});
