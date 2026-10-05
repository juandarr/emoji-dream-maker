import type { Composition, compileBrief } from "@/features/playground/model";
import type { Locale } from "@/lib/types";
export const outputKinds=["interpretation","message","poem","story","lyrics","image-prompt","storyboard"] as const;
export type OutputKind=typeof outputKinds[number];
export const reasoningEfforts=["default","low","medium","high"] as const;
export type ReasoningEffort=typeof reasoningEfforts[number];
export type GenerationSettings={kind:OutputKind;locale:Locale;tone:string;model:string;reasoningEffort?:ReasoningEffort};
export type GenerationResult={text:string;title?:string;model:string;provider:"openrouter";usage?:{promptTokens:number;completionTokens:number;cost?:number};generationId?:string};
export type GenerationRun={id:string;createdAt:number;identity:string;board:Composition;brief:ReturnType<typeof compileBrief>;settings:GenerationSettings;status:"running"|"succeeded"|"failed"|"unknown";result?:GenerationResult;error?:string};

/** An authored title always wins; older saved runs need no migration. */
export function creationTitle(run:GenerationRun) {
  return run.board.title.trim()?run.board.title:run.result?.title;
}
