import "server-only";
import { canvasIdentity, configurationIdentity } from "@/features/playground/creations";
import type { GenerationRun } from "@/features/generation/model";
import { hash } from "./http";
/** Retain only a digest after deletion; a deliberate new save can verify the
 * editor's original inputs/metadata without retaining or returning removed text. */
export function runProvenance(run:GenerationRun){return hash(JSON.stringify({version:1,id:run.id,createdAt:run.createdAt,identity:run.identity,canvas:canvasIdentity(run.board),configuration:configurationIdentity(run.board,run.settings),brief:run.brief,result:run.result?{model:run.result.model,provider:run.result.provider,usage:run.result.usage,generationId:run.result.generationId}:null}));}
