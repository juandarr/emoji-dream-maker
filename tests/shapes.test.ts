import {describe,expect,it} from "vitest";
import {createNode} from "@/features/playground/model";
import {emojiById} from "@/lib/catalog";
import {pointInShape,shapeFromAlpha,shapeIntersectsArea} from "@/features/playground/shapes";
import {rotatePoint} from "@/features/playground/transforms";

const world={width:1000,height:500};
const node=createNode(emojiById.get("1F419")!,"en","octopus",0,{x:40,y:50});
// A ring with empty outer margins and a genuinely transparent hole.
const alpha=new Uint8Array(100);
for(let y=2;y<8;y++)for(let x=2;x<8;x++)if(x<4||x>=6||y<4||y>=6)alpha[y*10+x]=255;
const shape=shapeFromAlpha(alpha,10);
describe("artwork shape hit testing",()=>{
  it("ignores rectangular padding and transparent holes but includes painted parts",()=>{
    expect(pointInShape(node,{x:382,y:232},world,shape)).toBe(false);
    expect(pointInShape(node,{x:400,y:250},world,shape)).toBe(false);
    expect(pointInShape(node,{x:390,y:250},world,shape)).toBe(true);
    expect(shapeIntersectsArea(node,{left:380,right:385,top:230,bottom:270},world,shape)).toBe(false);
    expect(shapeIntersectsArea(node,{left:398,right:402,top:248,bottom:252},world,shape)).toBe(false);
    expect(shapeIntersectsArea(node,{left:388,right:390,top:248,bottom:252},world,shape)).toBe(true);
  });
  it("uses the same silhouette after rotation and scaling on a non-square world",()=>{
    const rotated={...node,rotation:45,scale:2};
    const p=rotatePoint({x:-20,y:0},45);
    expect(pointInShape(rotated,{x:400+p.x,y:250+p.y},world,shape)).toBe(true);
    expect(pointInShape(rotated,{x:400,y:250},world,shape)).toBe(false);
    expect(shapeIntersectsArea(rotated,{left:399,right:401,top:249,bottom:251},world,shape)).toBe(false);
    expect(shapeIntersectsArea(rotated,{left:400+p.x-1,right:400+p.x+1,top:250+p.y-1,bottom:250+p.y+1},world,shape)).toBe(true);
  });
  it("includes painted edge contact with a bounded tolerance and rejects an actual gap",()=>{
    expect(shapeIntersectsArea(node,{left:380,right:388,top:246,bottom:254},world,shape)).toBe(true);
    expect(shapeIntersectsArea(node,{left:380,right:387.98,top:246,bottom:254},world,shape,1/32)).toBe(true);
    expect(shapeIntersectsArea(node,{left:380,right:387.9,top:246,bottom:254},world,shape,1/32)).toBe(false);
    const barelyVisible=new Uint8Array([15,16,0,0]);expect(shapeFromAlpha(barelyVisible,2).rows).toEqual([[{left:1,right:2}],[]]);
  });
});
