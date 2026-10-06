import {describe,expect,it} from "vitest";
import {emojiById} from "@/lib/catalog";
import {arrangeNodes,boardReducer,createNode,emptyComposition,semanticIdentity} from "@/features/playground/model";
import {copySelection,pasteSelection,readSelection} from "@/features/playground/clipboard";
import {fitCamera,resizeCamera,worldPoint} from "@/features/playground/camera";
import {paintedBounds,shapeFromAlpha} from "@/features/playground/shapes";

const world={width:800,height:400};
const nodes=['a','b','c','d'].map((id,i)=>({...createNode(emojiById.get('2764')!,"en",id,i),x:20+i*10,y:30+i*5,scale:i+1,rotation:i*25,note:'Keep my note'}));
const board={...emptyComposition(),nodes,edges:[{id:'inside',source:'a',target:'c',label:'with'},{id:'outside',source:'a',target:'b',label:'near'}]};
describe('selection clipboard and layer ordering',()=>{
 it('copies an immutable group and only its internal connections, remapping IDs atomically on paste',()=>{
  const clip=copySelection(board,['c','a'],world)!;
  expect(clip.nodes.map(n=>n.id)).toEqual(['a','c']);expect(clip.edges.map(e=>e.id)).toEqual(['inside']);
  const original=structuredClone(clip);clip.nodes[0].meaning='Edited copy';expect(board.nodes[0].meaning).not.toBe('Edited copy');
  let id=0;const pasted=pasteSelection(original,{width:400,height:800},{x:200,y:400},()=>`paste-${id++}`);
  expect(pasted.nodes.map(n=>n.id)).toEqual(['paste-0','paste-1']);expect(pasted.edges[0]).toEqual({id:'paste-2',source:'paste-0',target:'paste-1',label:'with'});
  expect((pasted.nodes[1].x-pasted.nodes[0].x)*4).toBeCloseTo((nodes[2].x-nodes[0].x)*8);
  expect(pasted.nodes.map(n=>[n.scale,n.rotation,n.note])).toEqual(original.nodes.map(n=>[n.scale,n.rotation,n.note]));
  const state=boardReducer({past:[],present:board,future:[]},{type:'paste',...pasted});expect(state.past).toHaveLength(1);expect(boardReducer(state,{type:'undo'}).present).toEqual(board);
  expect(readSelection(JSON.stringify(original))).toEqual(original);
 });
 it('rejects corrupt clipboard payloads and pastes that exceed capacity without partial insertion',()=>{
  const clip=copySelection(board,['a'],world)!;
  for(const value of ['hello',JSON.stringify({...clip,world:{width:0,height:400}}),JSON.stringify({...clip,nodes:[{...nodes[0],scale:Infinity}]}),JSON.stringify({...clip,edges:board.edges})])expect(readSelection(value)).toBeNull();
  const full={...emptyComposition(),nodes:Array.from({length:80},(_,i)=>({...nodes[0],id:`full-${i}`}))};
  const state={past:[],present:full,future:[]};expect(boardReducer(state,{type:'paste',nodes:[{...nodes[0],id:'extra'}],edges:[]})).toBe(state);
 });
 it('moves selected layers through neighbors while preserving internal order and saved relationships',()=>{
  expect(arrangeNodes(nodes,['a','c'],'front').map(n=>n.id)).toEqual(['b','d','a','c']);
  expect(arrangeNodes(nodes,['a','c'],'forward').map(n=>n.id)).toEqual(['b','a','d','c']);
  expect(arrangeNodes(nodes,['b','d'],'backward').map(n=>n.id)).toEqual(['b','a','d','c']);
  expect(arrangeNodes(nodes,['b','d'],'back').map(n=>n.id)).toEqual(['b','d','a','c']);
  const changed=boardReducer({past:[],present:board,future:[]},{type:'arrange',ids:['a','c'],direction:'front'});
  expect(changed.present.edges).toEqual(board.edges);expect(semanticIdentity(changed.present,'en')).not.toBe(semanticIdentity(board,'en'));expect(boardReducer(changed,{type:'undo'}).present).toEqual(board);
 });
});
describe('fitting and viewport changes',()=>{
 it('centers painted asymmetric, scaled and rotated artwork and fits the limiting dimension to 95%',()=>{
  const alpha=new Uint8Array(16);alpha[0]=255;alpha[1]=255;
  const shape=shapeFromAlpha(alpha,4),node={...nodes[0],scale:2,rotation:90};
  const bounds=paintedBounds([node],world,new Map([[node.glyph,shape]]))!;
  expect(bounds).toEqual({left:180,right:200,top:80,bottom:120});
  const camera=fitCamera([{x:bounds.left,y:bounds.top},{x:bounds.right,y:bounds.bottom}],800,400);
  expect((bounds.left+bounds.right)/2*camera.zoom+camera.x).toBeCloseTo(400);
  expect((bounds.top+bounds.bottom)/2*camera.zoom+camera.y).toBeCloseTo(200);
  expect(Math.max((bounds.right-bounds.left)*camera.zoom/800,(bounds.bottom-bounds.top)*camera.zoom/400)).toBeCloseTo(.95);
  const huge=fitCamera([{x:-1000000,y:-10},{x:1000000,y:10}],320,200);expect(huge.zoom).toBeLessThan(.1);expect(huge.x-1000000*huge.zoom).toBeCloseTo(8);
 });
 it('scales the view with the viewport and retains the world point at its center',()=>{
  const camera={x:-30,y:45,zoom:1.3},next={width:1400,height:900};
  const expanded=resizeCamera(camera,world,next);expect(expanded.zoom).toBeCloseTo(camera.zoom*1.75);
  const after=worldPoint({x:700,y:450},expanded),before=worldPoint({x:400,y:200},camera);
  expect(after.x).toBeCloseTo(before.x);expect(after.y).toBeCloseTo(before.y);
 });
});
