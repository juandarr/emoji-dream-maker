import { initialPreferences, validTopic, discoveryKey, type Preferences } from "@/lib/storage";
import { emojiById } from "@/lib/catalog";
import { isTheme } from "@/lib/themes";
import { outputKinds, reasoningEfforts, type GenerationSettings } from "@/features/generation/model";
export type AccountData = { preferences: Preferences; playground: GenerationSettings | null; revision: number };
export type AccountIdentity = { id: string; name: string; username: string };
export function emptyAccountData(): AccountData { return {preferences:{...initialPreferences,favorites:[],history:[]},playground:null,revision:0}; }
export function validateAccountData(value:unknown): Omit<AccountData,"revision"> {
  const v=value as AccountData,p=v?.preferences;
  if(!p||!["en","es"].includes(p.locale)||!isTheme(p.theme)||!["constellation","grid","list"].includes(p.view)||typeof p.reduced!=="boolean")throw new Error("Invalid preferences");
  for(const [items,limit] of [[p.favorites,200],[p.history,50]] as const){
    if(!Array.isArray(items)||items.length>limit||items.some(d=>!d||!emojiById.has(d.emojiId)||!validTopic(d.topic)||!Number.isFinite(d.at))||new Set(items.map(discoveryKey)).size!==items.length)throw new Error("Invalid discovery state");
  }
  const s=v.playground;
  if(s!==null&&(!s||!outputKinds.includes(s.kind)||!["en","es"].includes(s.locale)||typeof s.model!=="string"||s.model.length>150||typeof s.tone!=="string"||s.tone.length>120||s.reasoningEffort!==undefined&&!reasoningEfforts.includes(s.reasoningEffort)))throw new Error("Invalid Playground preferences");
  return {preferences:{locale:p.locale,theme:p.theme,view:p.view,reduced:p.reduced,favorites:p.favorites.map(d=>({emojiId:d.emojiId,topic:d.topic,at:d.at})),history:p.history.map(d=>({emojiId:d.emojiId,topic:d.topic,at:d.at}))},playground:s?{kind:s.kind,locale:s.locale,model:s.model,tone:s.tone,reasoningEffort:s.reasoningEffort||"default"}:null};
}
