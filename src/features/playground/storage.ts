import { compileBrief, parseComposition } from "./model";
import { outputKinds, reasoningEfforts, type GenerationRun } from "@/features/generation/model";

/** Damaged optional run records must never prevent opening a valid board. */
export function restoreRuns(value:unknown):GenerationRun[] {
  if(!Array.isArray(value))return [];
  const result:GenerationRun[]=[];
  for(const run of value) {
    try {
      if(!run || typeof run.id!=="string" || run.id.length>100 || typeof run.identity!=="string" || run.identity.length>512000 || typeof run.createdAt!=="number" || !Number.isFinite(run.createdAt) || !["running","succeeded","failed","unknown","canceled"].includes(run.status))continue;
      const settings=run.settings;
      if(!settings || !outputKinds.includes(settings.kind) || !["en","es"].includes(settings.locale) || typeof settings.tone!=="string" || settings.tone.length>120 || typeof settings.model!=="string" || settings.model.length>150 || settings.reasoningEffort!==undefined&&!reasoningEfforts.includes(settings.reasoningEffort))continue;
      const board=parseComposition(run.board);
      const brief=compileBrief(board,settings.locale);
      // Older briefs omitted layout, but their board snapshots already retained it.
      // Upgrade matching identities without hiding an actual change to the author's ideas.
      const {stackingOrder:legacyStack,...versionTwo}=brief;
      const {layout:legacyLayout,...versionOne}=versionTwo;
      void legacyStack;void legacyLayout;
      const matchesLegacy=run.identity===JSON.stringify({...versionTwo,compilerVersion:2})||run.identity===JSON.stringify({...versionOne,compilerVersion:1});
      const identity=matchesLegacy?JSON.stringify(brief):run.identity;
      if(run.result && (typeof run.result.text!=="string" || run.result.text.length>16000 || typeof run.result.model!=="string" || run.result.model.length>150 || run.result.provider!=="openrouter"))continue;
      if(run.status==="succeeded"&&!run.result)continue;
      const usage=run.result?.usage;
      const restored:GenerationRun={id:run.id,identity,createdAt:run.createdAt,board,brief,settings:{kind:settings.kind,locale:settings.locale,tone:settings.tone,model:settings.model,...(settings.reasoningEffort?{reasoningEffort:settings.reasoningEffort}:{})},status:run.status=== "running"?"unknown":run.status};
      if(run.result)restored.result={text:run.result.text,...(typeof run.result.title==="string"&&run.result.title.trim()?{title:run.result.title.slice(0,120)}:{}),model:run.result.model,provider:"openrouter",generationId:typeof run.result.generationId==="string"?run.result.generationId.slice(0,200):undefined,usage:usage&&Number.isFinite(usage.promptTokens)&&Number.isFinite(usage.completionTokens)?{promptTokens:usage.promptTokens,completionTokens:usage.completionTokens,...(Number.isFinite(usage.cost)?{cost:usage.cost}:{})}:undefined};
      restored.error=run.status==="running"?"The request was interrupted. Its provider outcome is unknown; it will not be retried automatically.":typeof run.error==="string"?run.error.slice(0,1000):undefined;
      restored.errorCode=run.status==="running"?"interrupted":typeof run.errorCode==="string"?run.errorCode.slice(0,50):undefined;
      result.push(restored);
    } catch { /* Preserve the board even if a saved request snapshot is damaged. */ }
  }
  return result;
}
