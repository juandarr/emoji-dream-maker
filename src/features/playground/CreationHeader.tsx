"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Copy, Download, Feather, Folder, Plus, SlidersHorizontal, Sparkles, Upload } from "lucide-react";
import type { Locale } from "@/lib/types";
import { outputKinds, reasoningEfforts, type OutputKind, type ReasoningEffort } from "@/features/generation/model";
import type { Composition } from "./model";
import { playgroundLabels } from "./labels";
import "./creation-header.css";

export type GenerationConfig = {configured:boolean;models:string[];maxOutputTokens:number;reasoningEffort?:ReasoningEffort};
const labels={
  en:{context:"Add context",relationships:"Add relationships",settings:"Settings",board:"Board",optional:"Optional",automaticTitle:"Let your creation name itself",titleHint:"Leave blank to generate a title.",brief:"Edit the canvas interpretation",empty:"Add an emoji to start creating.",formats:{interpretation:"A paragraph inspired by the emojis on your canvas.",message:"Say something meaningful in just a few lines.",poem:"Turn your symbols into imagery, rhythm and verse.",story:"Give your symbols a world, a beginning and an ending.",lyrics:"Find the words and a chorus for your scene.","image-prompt":"Describe a visual world for an image generator.",storyboard:"Imagine your scene, one shot at a time."}},
  es:{context:"Añadir contexto",relationships:"Añadir relaciones",settings:"Ajustes",board:"Lienzo",optional:"Opcional",automaticTitle:"Deja que tu creación encuentre su nombre",titleHint:"Déjalo en blanco para generar un título.",brief:"Editar la interpretación del lienzo",empty:"Añade un emoji para empezar a crear.",formats:{interpretation:"Un párrafo inspirado en los emojis de tu lienzo.",message:"Expresa algo significativo en unas pocas líneas.",poem:"Convierte tus símbolos en imágenes, ritmo y versos.",story:"Dales a tus símbolos un mundo, un comienzo y un final.",lyrics:"Encuentra las palabras y un estribillo para tu escena.","image-prompt":"Describe un mundo visual para un generador de imágenes.",storyboard:"Imagina tu escena, plano a plano."}},
};
type Props={
  locale:Locale; board:Composition; interpretation:string;
  kind:OutputKind; onKind:(kind:OutputKind)=>void; outputNames:Record<OutputKind,string>;
  model:string; onModel:(model:string)=>void; reasoningEffort:ReasoningEffort; onReasoning:(effort:ReasoningEffort)=>void;
  config:GenerationConfig|null; configFailed:boolean; onCheck:()=>void;
  busy:boolean; status:string; error?:string; onGenerate:()=>void;
  onFields:(patch:Partial<Pick<Composition,"title"|"intent"|"interpretation">>)=>void;
  onCopy:()=>void; onExport:()=>void; onImport:()=>void; inspector:ReactNode;
};
export default function CreationHeader(props:Props) {
  const {locale,board,interpretation,kind,onKind,outputNames,model,onModel,reasoningEffort,onReasoning,config,configFailed,onCheck,busy,status,error,onGenerate,onFields,onCopy,onExport,onImport,inspector}=props;
  const t=playgroundLabels[locale],h=labels[locale];
  const [contextOpen,setContextOpen]=useState(false),[relationshipsOpen,setRelationshipsOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[filesOpen,setFilesOpen]=useState(false);
  const efforts:Record<ReasoningEffort,string>={default:t.reasoningDefault,low:t.reasoningLow,medium:t.reasoningMedium,high:t.reasoningHigh};
  const connectionIssue=configFailed||!!config&&!config.configured;
  return <section className="pg-creation-header" aria-label={t.create}>
    <div className="pg-header-main">
      <label className="pg-format"><span>{t.output}</span><div className="pg-format-control"><select aria-label={t.output} aria-describedby="pg-format-description" value={kind} onChange={e=>onKind(e.target.value as OutputKind)}>{outputKinds.map(output=><option key={output} value={output}>{outputNames[output]}</option>)}</select><ChevronDown size={20}/></div></label>
      <p id="pg-format-description" className="pg-format-description">{h.formats[kind]}</p>
      <div className="pg-header-options">
        <button className="pg-header-toggle" aria-expanded={contextOpen} aria-controls="pg-context" onClick={()=>{setContextOpen(!contextOpen);if(contextOpen)setRelationshipsOpen(false);}}><Plus size={15}/>{h.context}</button>
        <button className="pg-header-toggle" aria-expanded={relationshipsOpen} aria-controls="pg-symbol-editor" onClick={()=>{setRelationshipsOpen(!relationshipsOpen);if(!relationshipsOpen)setContextOpen(true);}}><span className="pg-toggle-switch" aria-hidden="true"/>{h.relationships}</button>
        <button className="pg-header-toggle" aria-expanded={settingsOpen} aria-controls="pg-generation-settings" onClick={()=>setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={15}/>{h.settings}{connectionIssue&&<span className="pg-settings-alert" aria-hidden="true">!</span>}</button>
      </div>
      <div id="pg-context" className={`pg-context-panels ${relationshipsOpen?"with-relationships":""}`} hidden={!contextOpen}>
        <section className="pg-panel pg-meaning" aria-label={t.meaningTitle}>
          <div className="pg-panel-heading"><h2><Feather size={16}/>{t.meaningTitle}</h2><button className="pg-copy-brief" aria-label={t.copy} title={t.copy} disabled={!board.nodes.length} onClick={onCopy}><Copy size={15}/></button></div>
          <label className="pg-scene"><span>{t.scene}<em>{h.optional}</em></span><input aria-label={t.scene} aria-describedby="pg-title-hint" maxLength={120} placeholder={h.automaticTitle} value={board.title} onChange={e=>onFields({title:e.target.value})}/><small id="pg-title-hint">{h.titleHint}</small></label>
          <label className="pg-intent">{t.intent}<textarea aria-label={t.intent} placeholder={t.intentPlaceholder} rows={3} maxLength={1000} value={board.intent} onChange={e=>onFields({intent:e.target.value})}/></label>
          <details className="pg-brief-options"><summary>{h.brief}</summary><label>{t.interpretation}<textarea aria-label={t.interpretation} rows={5} maxLength={4000} placeholder={t.noMeaning} value={interpretation} disabled={!board.nodes.length} onChange={e=>onFields({interpretation:e.target.value})}/></label>{board.interpretation&&<button className="pg-link" onClick={()=>onFields({interpretation:""})}>{t.reset}</button>}<p>{t.meaningHint}</p></details>
        </section>
        <div id="pg-symbol-editor" className="pg-header-inspector" hidden={!relationshipsOpen}>{inspector}</div>
      </div>
      <section id="pg-generation-settings" className="pg-panel pg-model-options" aria-label={h.settings} hidden={!settingsOpen}>
        <div className="pg-settings"><label>{t.model}<select aria-label={t.model} value={model} onChange={e=>onModel(e.target.value)}>{config?.models.map(m=><option value={m} key={m}>{m}</option>)}</select></label><label>{t.reasoning}<select aria-label={t.reasoning} value={reasoningEffort} onChange={e=>onReasoning(e.target.value as ReasoningEffort)}>{reasoningEfforts.map(effort=><option value={effort} key={effort}>{efforts[effort]}</option>)}</select></label></div>
        <p>{t.reasoningHint}</p><p>{t.cap.replace("{tokens}",String(config?.maxOutputTokens||8192))}</p><p>{t.mediaHint}</p><p>{t.sending}</p>
        <p className="pg-connection">{configFailed?t.checkFailed:!config?t.checking:config.configured?t.connected:t.setup}</p>{(!config||!config.configured)&&<button className="pg-link" onClick={onCheck}>{t.check}</button>}
        <button className="pg-link" disabled={!board.nodes.length} onClick={onCopy}>{t.localMessage}</button>
      </section>
      {connectionIssue&&!settingsOpen&&<p className="pg-header-issue" role="status">{configFailed?t.checkFailed:t.setup}<button className="pg-link" onClick={onCheck}>{t.check}</button></p>}
      {error&&<p className="pg-generation-status pg-header-issue" role="status">{error}</p>}
      {!error&&<span className="pg-header-status" role="status" aria-live="polite">{status}</span>}
    </div>
    <div className="pg-header-action-area">
      <details className="pg-board-menu" open={filesOpen} onToggle={e=>setFilesOpen(e.currentTarget.open)} onKeyDown={e=>{if(e.key==="Escape")setFilesOpen(false);}}><summary><Folder size={15}/>{h.board}<ChevronDown size={13}/></summary><div><button onClick={()=>{onExport();setFilesOpen(false);}}><Download size={15}/>{t.export}</button><button onClick={()=>{onImport();setFilesOpen(false);}}><Upload size={15}/>{t.import}</button></div></details>
      <div className="pg-create-column"><button className="primary-button pg-generate" disabled={busy||!board.nodes.length||!config?.configured||!model} title={!board.nodes.length?h.empty:undefined} onClick={onGenerate}><Sparkles size={18}/>{busy?t.generating:t.generate}</button></div>
    </div>
  </section>;
}
