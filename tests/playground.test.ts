import { describe, expect, it } from "vitest";
import { emojiById } from "@/lib/catalog";
import { boardReducer, compileBrief, createNode, emptyComposition, parseComposition, semanticIdentity, type BoardHistory } from "@/features/playground/model";
import { restoreRuns } from "@/features/playground/storage";
const heart=emojiById.get("2764")!;
function fixture() {const board=emptyComposition();board.nodes=[createNode(heart,"en","first",0),createNode(heart,"en","second",1)];return board;}
describe("playground document",()=>{
  it("keeps repeated symbols and user meanings independent",()=>{
    const board=fixture();const state=boardReducer({past:[],present:board,future:[]},{type:"update",id:"second",patch:{meaning:"Human heart"}});
    expect(state.present.nodes[0].meaning).toBe("Love");expect(state.present.nodes[1].meaning).toBe("Human heart");
    const brief=compileBrief(state.present,"en");expect(brief.interpretation).toContain("Human heart");expect(brief.entities.map(n=>n.id)).toEqual(["first","second"]);
  });
  it("includes layout, custom meanings and relationships in the creation identity",()=>{
    const board=fixture(),moved=structuredClone(board);moved.nodes[0].x=90;
    expect(semanticIdentity(moved,"en")).not.toBe(semanticIdentity(board,"en"));
    moved.nodes[0].meaning="Anatomy";expect(semanticIdentity(moved,"en")).not.toBe(semanticIdentity(board,"en"));
    const linked={...board,edges:[{id:"link",source:"first",target:"second",label:"contrasts with"}]};expect(compileBrief(linked,"es").interpretation).toContain("contrasts with");expect(semanticIdentity(linked,"en")).not.toBe(semanticIdentity(board,"en"));
  });
  it("undoes one completed movement and restores removed relationships on undo",()=>{
    const board=fixture();board.edges=[{id:"edge",source:"first",target:"second",label:"evokes"}];
    let state:BoardHistory={past:[],present:board,future:[]};
    state=boardReducer(state,{type:"update",id:"first",patch:{x:70,y:80}});
    expect(state.past).toHaveLength(1);state=boardReducer(state,{type:"undo"});expect(state.present).toEqual(board);
    state=boardReducer(state,{type:"redo"});expect(state.present.nodes[0].x).toBe(70);
    state=boardReducer(state,{type:"remove",id:"first"});expect(state.present.edges).toHaveLength(0);
    state=boardReducer(state,{type:"undo"});expect(state.present.edges).toHaveLength(1);
  });
  it("rejects corrupt imports and preserves saved unknown emoji snapshots",()=>{
    const board=fixture();expect(parseComposition(board)).toEqual(board);
    const future=structuredClone(board);future.nodes[0].emojiId="future-emoji";expect(parseComposition(future).nodes[0].glyph).toBe(heart.glyph);
    for(const value of [null,{...board,schemaVersion:2},{...board,nodes:[board.nodes[0],board.nodes[0]]},{...board,nodes:[{...board.nodes[0],x:Infinity}]},{...board,edges:[{id:"bad",source:"first",target:"missing",label:"with"}]},{...board,edges:[{id:"bad",source:"first",target:"first",label:"with"}]},{...board,intent:"x".repeat(1001)}])expect(()=>parseComposition(value)).toThrow();
  });
  it("retains an authored interpretation alongside explicit concepts",()=>{
    const board=fixture();board.interpretation="Two hearts in a medical classroom.";
    expect(compileBrief(board,"en").interpretation).toBe(board.interpretation);expect(compileBrief(board,"en").entities).toHaveLength(2);
  });
});

it("recovers interrupted runs and discards corrupt optional run records",()=>{
  const board=fixture();const run={id:"saved-run",identity:semanticIdentity(board,"en"),createdAt:123,status:"running",board,settings:{kind:"poem",locale:"en",tone:"gentle",model:"test/text"}};
  const runs=restoreRuns([null,{id:"broken",identity:"",status:"succeeded"},run]);
  expect(runs).toHaveLength(1);expect(runs[0].status).toBe("unknown");expect(runs[0].brief.entities).toHaveLength(2);expect(runs[0].error).toContain("not be retried automatically");
});

it("restores generated titles and interpretation runs without changing the input snapshot",()=>{
  const board=fixture();
  const run={id:"titled-run",identity:semanticIdentity(board,"es"),createdAt:123,status:"succeeded",board,settings:{kind:"interpretation",locale:"es",tone:"gentle",model:"test/text"},result:{title:"Dos corazones",text:"Un vínculo entre dos personas.",provider:"openrouter",model:"test/text"}};
  const restored=restoreRuns([run])[0];
  expect(restored.result?.title).toBe("Dos corazones");expect(restored.board.title).toBe("");expect(restored.settings.kind).toBe("interpretation");
  const old=restoreRuns([{...run,settings:{...run.settings,kind:"poem"},result:{text:"Old poem",provider:"openrouter",model:"test/text"}}])[0];
  expect(old.result?.text).toBe("Old poem");expect(old.result?.title).toBeUndefined();
});

it("restores up to 20 saved creations, including records beyond the old limit of 10",()=>{
  const board=fixture();const runs=Array.from({length:21},(_,index)=>({id:`run-${index}`,identity:semanticIdentity(board,"en"),createdAt:21-index,status:"succeeded",board,settings:{kind:"poem",locale:"en",tone:"gentle",model:"test/text"},result:{text:`Poem ${index}`,provider:"openrouter",model:"test/text"}}));
  const restored=restoreRuns(runs);expect(restored).toHaveLength(20);expect(restored[19].id).toBe("run-19");
});


it("carries independent placement, size and rotation for repeated symbols and authored interpretations",()=>{
  const board=fixture();board.nodes[0]={...board.nodes[0],x:48,y:43,scale:.4,rotation:-45};board.nodes[1]={...board.nodes[1],x:50,y:50,scale:2,rotation:90};board.interpretation="Two hearts in a medical classroom.";
  const brief=compileBrief(board,"en");expect(brief.layout).toEqual([{id:"first",xPercent:48,yPercent:43,sizeMultiplier:.4,clockwiseRotationDegrees:315},{id:"second",xPercent:50,yPercent:50,sizeMultiplier:2,clockwiseRotationDegrees:90}]);expect(brief.interpretation).toBe(board.interpretation);
  for(const patch of [{x:60},{scale:1},{rotation:0}]){const changed=structuredClone(board);Object.assign(changed.nodes[0],patch);expect(semanticIdentity(changed,"en")).not.toBe(semanticIdentity(board,"en"));}
  const fullTurn=structuredClone(board);fullTurn.nodes[0].rotation+=360;expect(semanticIdentity(fullTurn,"en")).toBe(semanticIdentity(board,"en"));
});

it("upgrades a matching legacy identity without marking an unchanged saved creation stale",()=>{
  const board=fixture(),{layout,stackingOrder,...legacy}=compileBrief(board,"en");void layout;void stackingOrder;
  const run={id:"legacy-run",identity:JSON.stringify({...legacy,compilerVersion:1}),createdAt:123,status:"succeeded",board,settings:{kind:"poem",locale:"en",tone:"gentle",model:"test/text"},result:{text:"Old poem",provider:"openrouter",model:"test/text"}};
  expect(restoreRuns([run])[0].identity).toBe(semanticIdentity(board,"en"));
  // A mismatched identity must not be rewritten as though the creation used these ideas.
  expect(restoreRuns([{...run,identity:"different ideas"}])[0].identity).toBe("different ideas");
  const {stackingOrder:stack,...versionTwo}=compileBrief(board,"en");void stack;
  expect(restoreRuns([{...run,identity:JSON.stringify({...versionTwo,compilerVersion:2})}])[0].identity).toBe(semanticIdentity(board,"en"));
});
