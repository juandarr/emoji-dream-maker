import {describe,expect,it} from "vitest";
import {emojiById} from "@/lib/catalog";
import {boardReducer,createNode,emptyComposition,parseComposition,semanticIdentity,type BoardHistory} from "@/features/playground/model";
import {intersectedNodes,nodeBounds,selectionFrame,resizeCursor,transformNodes} from "@/features/playground/transforms";

const world={width:1000,height:500};
const emoji=emojiById.get("2764")!;
const nodes=[createNode(emoji,"en","left",0,{x:40,y:50}),createNode(emoji,"en","right",1,{x:60,y:50}),createNode(emoji,"en","other",2,{x:90,y:90})];
describe("composition transforms",()=>{
  it("reads old boards with default transforms and rejects invalid transforms",()=>{
    const board={...emptyComposition(),nodes};
    const legacy={...board,nodes:board.nodes.map(({scale,rotation,...n})=>n)};
    expect(parseComposition(legacy)).toEqual(board);
    for(const patch of [{scale:0},{scale:13},{scale:NaN},{rotation:Infinity},{rotation:"45"}])expect(()=>parseComposition({...board,nodes:[{...nodes[0],...patch}]})).toThrow();
    expect(parseComposition({...board,nodes:[{...nodes[0],rotation:-90}]}).nodes[0].rotation).toBe(270);
  });
  it("rotates a group around its center in world units on a non-square canvas",()=>{
    const rotated=transformNodes(nodes.slice(0,2),world,{x:500,y:250},{angle:90});
    expect(rotated[0].x).toBeCloseTo(50);expect(rotated[0].y).toBeCloseTo(30);
    expect(rotated[1].x).toBeCloseTo(50);expect(rotated[1].y).toBeCloseTo(70);
    expect(rotated.map(n=>n.rotation)).toEqual([90,90]);
    const restored=transformNodes(rotated,world,{x:500,y:250},{angle:-90});
    expect(restored[0].x).toBeCloseTo(40);expect(restored[0].y).toBeCloseTo(50);
  });
  it("resizes relative positions and sizes together while limiting the group uniformly",()=>{
    const group=[nodes[0],{...nodes[1],scale:2}];
    const enlarged=transformNodes(group,world,{x:500,y:250},{factor:2});
    expect(enlarged.map(n=>n.x)).toEqual([30,70]);expect(enlarged.map(n=>n.scale)).toEqual([2,4]);
    expect(transformNodes(group,world,{x:500,y:250},{factor:100}).map(n=>n.scale)).toEqual([6,12]);
    expect(transformNodes(group,world,{x:500,y:250},{factor:0}).map(n=>n.scale)).toEqual([.2,.4]);
  });
  it("selects partial overlap and exact edge contact but excludes a gap",()=>{
    const node=nodes[0];
    expect(intersectedNodes([node],{left:415,right:430,top:240,bottom:260},world)).toEqual([node.id]);
    expect(intersectedNodes([node],{left:420,right:430,top:240,bottom:260},world)).toEqual([node.id]);
    expect(intersectedNodes([node],{left:420.01,right:430,top:240,bottom:260},world)).toEqual([]);
  });
  it("allows only a tiny rendering tolerance for painted edge contact",()=>{
    const area={left:420.01,right:430,top:240,bottom:260};
    expect(intersectedNodes([nodes[0]],area,world,1/32)).toEqual([nodes[0].id]);
    expect(intersectedNodes([nodes[0]],{...area,left:420.1},world,1/32)).toEqual([]);
  });
  it("uses actual rotated artwork rectangles instead of empty bounding-box corners",()=>{
    const node={...nodes[0],rotation:45,scale:2},box=nodeBounds(node,world);
    expect(box.right-box.left).toBeCloseTo(80*Math.SQRT2);
    expect(intersectedNodes([node],box,world)).toEqual([node.id]);
    expect(intersectedNodes([node],{left:box.left,top:box.top,right:box.left+1,bottom:box.top+1},world)).toEqual([]);
    expect(intersectedNodes([node],{left:box.right,top:249,right:box.right+1,bottom:251},world)).toEqual([node.id]);
  });
  it("keeps individual and group frames aligned during rigid rotations",()=>{
    const single=selectionFrame([{...nodes[0],rotation:45,scale:2}],world)!;
    expect(single.center.x).toBeCloseTo(400);expect(single.center.y).toBeCloseTo(250);expect(single.width).toBeCloseTo(80);expect(single.height).toBeCloseTo(80);expect(single.rotation).toBe(45);
    const original=selectionFrame(nodes.slice(0,2),world)!;
    const turned=selectionFrame(transformNodes(nodes.slice(0,2),world,original.center,{angle:90}),world)!;
    expect(turned.center.x).toBeCloseTo(original.center.x);expect(turned.center.y).toBeCloseTo(original.center.y);
    expect(turned.width).toBeCloseTo(original.width);expect(turned.height).toBeCloseTo(original.height);expect(turned.rotation).toBe(90);
  });
  it("matches the resize cursor direction to the rotated northwest–southeast handle",()=>{
    expect([0,45,90,135,180,355].map(resizeCursor)).toEqual(["nwse-resize","ns-resize","nesw-resize","ew-resize","nwse-resize","nwse-resize"]);
  });
  it("commits a group transform and deletion atomically, restoring edges on undo",()=>{
    const board={...emptyComposition(),nodes,edges:[{id:"internal",source:"left",target:"right",label:"with"},{id:"external",source:"right",target:"other",label:"near"}]};
    const transformed=transformNodes(nodes.slice(0,2),world,{x:500,y:250},{dx:50,dy:-20,factor:2,angle:30});
    let state:BoardHistory={past:[],present:board,future:[]};
    state=boardReducer(state,{type:"transform",updates:transformed.map(({id,x,y,scale,rotation})=>({id,patch:{x,y,scale,rotation}}))});
    expect(state.past).toHaveLength(1);expect(state.present.nodes[2]).toEqual(nodes[2]);
    expect(semanticIdentity(state.present,"en")).toBe(semanticIdentity(board,"en"));
    const saved=state.present;expect(parseComposition(saved)).toEqual(saved);
    state=boardReducer(state,{type:"undo"});expect(state.present).toEqual(board);
    state=boardReducer(state,{type:"redo"});expect(state.present).toEqual(saved);
    state=boardReducer(state,{type:"removeMany",ids:["left","right"]});
    expect(state.present.nodes).toEqual([nodes[2]]);expect(state.present.edges).toEqual([]);
    state=boardReducer(state,{type:"undo"});expect(state.present).toEqual(saved);
  });
});
