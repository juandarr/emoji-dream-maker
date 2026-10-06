import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n";
import { dragAccessibility } from "@/lib/drag-accessibility";
import { emojiById } from "@/lib/catalog";
import { playgroundLabels } from "@/features/playground/labels";
import { storyLabels } from "@/features/playground/story-labels";
import { nodeLabel, nodeMeaning } from "@/features/playground/localization";
import { compileBrief, createNode, emptyComposition, parseComposition } from "@/features/playground/model";
import { generationErrors, generationErrorMessage } from "@/features/generation/messages";
import { restoreRuns } from "@/features/playground/storage";

describe("English and Spanish interface coverage", () => {
  it("has matching, nonempty messages and interpolation placeholders", () => {
    const dictionaries: {en:Record<string,string>;es:Record<string,string>}[] = [messages, playgroundLabels, storyLabels, generationErrors];
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary.es).sort()).toEqual(Object.keys(dictionary.en).sort());
      for (const key of Object.keys(dictionary.en)) {
        const english = dictionary.en[key];
        const spanish = dictionary.es[key];
        expect(spanish.trim(), key).not.toBe("");
        expect(spanish.match(/\{\w+\}/g) || [], key).toEqual(english.match(/\{\w+\}/g) || []);
      }
    }
    expect(playgroundLabels.es.name).toBe("Espacio creativo");
    expect(Object.values(playgroundLabels.es).join(" ")).not.toMatch(/playground|prompt|curados/i);
  });
  it("localizes catalog labels and automatic meanings without rewriting authored content", () => {
    const node = createNode(emojiById.get("2764")!, "en", "heart", 0);
    expect(nodeLabel(node, "es")).toBe("corazón rojo");
    expect(nodeMeaning(node, "es")).toBe("Amor");
    expect(nodeMeaning({...node, meaning:"My childhood"}, "es")).toBe("My childhood");
    expect(nodeMeaning({...node, customMeaning:true}, "es")).toBe("Love");
    expect(nodeLabel({...node,emojiId:"unknown",label:"My symbol"}, "es")).toBe("My symbol");
    const board = {...emptyComposition(),nodes:[node],intent:"A handwritten note"};
    expect(compileBrief(board,"es").entities[0].meaning).toBe("Amor");
    expect(compileBrief(board,"es").interpretation).toContain("Ideas elegidas: ❤️ Amor");
    expect(board.nodes[0].meaning).toBe("Love");
    expect(board.intent).toBe("A handwritten note");
    expect(parseComposition({...board,nodes:[{...node,customMeaning:true}]}).nodes[0].customMeaning).toBe(true);
  });
  it("uses localized variants and speaks emoji names instead of internal drag IDs", () => {
    const emoji = emojiById.get("1F44B")!;
    const variant = emoji.variants[0];
    expect(nodeLabel(createNode(emoji,"en","hand",0,undefined,variant.glyph),"es")).toBe(variant.labels.es);
    const accessibility = dragAccessibility("es",true);
    expect(accessibility.screenReaderInstructions.draggable).toContain("Espacio");
    expect(accessibility.announcements.onDragStart({active:{id:"tray:1F44B"} as never})).toBe("Has recogido mano saludando.");
  });
  it("keeps saved failure codes translatable, including interrupted and legacy runs", () => {
    const board = {...emptyComposition(),nodes:[createNode(emojiById.get("2764")!,"en","heart",0)]};
    const run = {id:"run",identity:"",createdAt:1,board,status:"failed",error:"OpenRouter needs credits",errorCode:"credits",settings:{kind:"poem",locale:"en",tone:"gentle",model:"test/text"}};
    const restored = restoreRuns([run])[0];
    expect(generationErrorMessage(restored,"es")).toBe(generationErrors.es.credits);
    expect(generationErrorMessage(restored,"en")).toBe(generationErrors.en.credits);
    expect(restoreRuns([{...run,status:"running"}])[0].errorCode).toBe("interrupted");
    expect(generationErrorMessage({status:"unknown"},"es")).toBe(generationErrors.es.unknown);
    expect(generationErrorMessage({status:"failed",errorCode:"__proto__"},"es")).toBe(generationErrors.es.failed);
  });
});
