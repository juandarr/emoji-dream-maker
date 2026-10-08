"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Copy, Feather, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Locale } from "@/lib/types";
import { outputKinds, reasoningEfforts, type OutputKind, type ReasoningEffort } from "@/features/generation/model";
import type { Composition } from "./model";
import { playgroundLabels } from "./labels";
import SettingsInformation from "./SettingsInformation";
import HoverInformation from "./HoverInformation";
import { creationLabels } from "./creation-labels";
import "./creation-header.css";

export type GenerationConfig = {configured:boolean;models:string[];maxOutputTokens:number;reasoningEffort?:ReasoningEffort};
const labels={
  en:{context:"Context",relationships:"Add relationships",settings:"Settings",board:"Board",optional:"Optional",automaticTitle:"Let your creation name itself",titleHint:"Leave blank to generate a title.",brief:"Edit the canvas interpretation",empty:"Add an emoji to start creating.",formats:{interpretation:"A paragraph inspired by the emojis on your canvas.",message:"Say something meaningful in just a few lines.",poem:"Turn your symbols into imagery, rhythm and verse.",story:"Give your symbols a world, a beginning and an ending.",lyrics:"Find the words and a chorus for your scene.","image-prompt":"Describe a visual world for an image generator.",storyboard:"Imagine your scene, one shot at a time."}},
  es:{context:"Contexto",relationships:"Añadir relaciones",settings:"Ajustes",board:"Lienzo",optional:"Opcional",automaticTitle:"Deja que tu creación encuentre su nombre",titleHint:"Déjalo en blanco para generar un título.",brief:"Editar la interpretación del lienzo",empty:"Añade un emoji para empezar a crear.",formats:{interpretation:"Un párrafo inspirado en los emojis de tu lienzo.",message:"Expresa algo significativo en unas pocas líneas.",poem:"Convierte tus símbolos en imágenes, ritmo y versos.",story:"Dales a tus símbolos un mundo, un comienzo y un final.",lyrics:"Encuentra las palabras y un estribillo para tu escena.","image-prompt":"Describe un mundo visual para un generador de imágenes.",storyboard:"Imagina tu escena, plano a plano."}},
};
type Props={
  locale:Locale; board:Composition; interpretation:string;
  outputLocale:Locale;onOutputLocale:(locale:Locale)=>void;
  kind:OutputKind; onKind:(kind:OutputKind)=>void; outputNames:Record<OutputKind,string>;
  model:string; onModel:(model:string)=>void; reasoningEffort:ReasoningEffort; onReasoning:(effort:ReasoningEffort)=>void;
  config:GenerationConfig|null; configFailed:boolean; onCheck:()=>void;
  busy:boolean; status:string; error?:string; onGenerate:()=>void;
  onFields:(patch:Partial<Pick<Composition,"title"|"intent"|"interpretation">>)=>void;
  onCopy:()=>void; onCancel:()=>void; inspector:ReactNode;
};
export default function CreationHeader(props:Props) {
  const {locale,board,interpretation,outputLocale,onOutputLocale,kind,onKind,outputNames,model,onModel,reasoningEffort,onReasoning,config,configFailed,onCheck,busy,status,error,onGenerate,onFields,onCopy,onCancel,inspector}=props;
  const t=playgroundLabels[locale],h=labels[locale];
  const [contextOpen,setContextOpen]=useState(false),[relationshipsOpen,setRelationshipsOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false);
  const efforts:Record<ReasoningEffort,string>={default:t.reasoningDefault,low:t.reasoningLow,medium:t.reasoningMedium,high:t.reasoningHigh};
  const summaryLabels=locale==="es"?{name:"Resumen de generación",model:"Modelo",context:"Contexto",none:"Sin contexto adicional",edited:"Interpretación del lienzo editada",automatic:"Interpretación del lienzo automática"}:{name:"Generation summary",model:"Model",context:"Context",none:"No additional context",edited:"Canvas interpretation edited",automatic:"Automatic canvas interpretation"};
  return <section className="pg-creation-header" aria-label={t.create}>
    <div className="pg-header-main">
      <label className="pg-format"><span>{t.output}</span><div className="pg-format-control"><select aria-label={t.output} aria-describedby="pg-format-description" value={kind} onChange={e=>onKind(e.target.value as OutputKind)}>{outputKinds.map(output=><option key={output} value={output}>{outputNames[output]}</option>)}</select><ChevronDown size={20}/></div></label>
      <p id="pg-format-description" className="pg-format-description">{h.formats[kind]}</p>
      <div className="pg-header-options">
        <button className="pg-header-toggle" aria-expanded={contextOpen} aria-controls="pg-context" onClick={()=>setContextOpen(!contextOpen)}><Plus size={15}/>{h.context}</button>
        <div className="pg-settings-option"><button className="pg-header-toggle" aria-expanded={settingsOpen} aria-controls="pg-generation-settings" onClick={()=>setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={15}/>{h.settings}</button><SettingsInformation locale={locale} config={config} configFailed={configFailed} onCheck={onCheck} onCopy={onCopy} canCopy={!!board.nodes.length}/></div>
      </div>
      <section id="pg-context" className="pg-panel pg-context-panel" aria-label={h.context} hidden={!contextOpen}>
        <div className="pg-panel-heading pg-context-heading"><h2><Feather size={16}/>{t.meaningTitle}</h2><button className="pg-copy-brief" aria-label={t.copy} title={t.copy} disabled={!board.nodes.length} onClick={onCopy}><Copy size={15}/></button></div>
        <button className="pg-header-toggle pg-context-relationship-toggle" aria-expanded={relationshipsOpen} aria-controls="pg-symbol-editor" onClick={()=>setRelationshipsOpen(!relationshipsOpen)}><span className="pg-toggle-switch" aria-hidden="true"/>{h.relationships}</button>
        <div className={`pg-context-panels ${relationshipsOpen?"with-relationships":""}`}>
        <section className="pg-meaning" aria-label={t.meaningTitle}>
          <label className="pg-scene"><span>{t.scene}<em>{h.optional}</em></span><input aria-label={t.scene} aria-describedby="pg-title-hint" maxLength={120} placeholder={h.automaticTitle} value={board.title} onChange={e=>onFields({title:e.target.value})}/><small id="pg-title-hint">{h.titleHint}</small></label>
          <label className="pg-intent">{t.intent}<textarea aria-label={t.intent} placeholder={t.intentPlaceholder} rows={3} maxLength={1000} value={board.intent} onChange={e=>onFields({intent:e.target.value})}/></label>
          <details className="pg-brief-options"><summary>{h.brief}</summary><label>{t.interpretation}<textarea aria-label={t.interpretation} rows={5} maxLength={4000} placeholder={t.noMeaning} value={interpretation} disabled={!board.nodes.length} onChange={e=>onFields({interpretation:e.target.value})}/></label>{board.interpretation&&<button className="pg-link" onClick={()=>onFields({interpretation:""})}>{t.reset}</button>}<p>{t.meaningHint}</p></details>
        </section>
        <div id="pg-symbol-editor" className="pg-header-inspector" hidden={!relationshipsOpen}>{inspector}</div>
        </div>
      </section>
      <section id="pg-generation-settings" className="pg-panel pg-model-options" aria-label={h.settings} hidden={!settingsOpen}>
        <div className="pg-settings"><label>{t.language}<select aria-label={t.language} value={outputLocale} onChange={e=>onOutputLocale(e.target.value as Locale)}><option value="en">English</option><option value="es">Español</option></select></label><label>{t.model}<select aria-label={t.model} disabled={!config?.models.length} value={model} onChange={e=>onModel(e.target.value)}>{!model&&!!config?.models.length&&<option value="">{locale==="es"?"Elige un modelo":"Choose a model"}</option>}{!config?.models.length&&<option value="">{config?t.noModels:t.checking}</option>}{model&&!config?.models.includes(model)&&<option value={model}>{model}</option>}{config?.models.map(m=><option value={m} key={m}>{m}</option>)}</select></label><label>{t.reasoning}<select aria-label={t.reasoning} value={reasoningEffort} onChange={e=>onReasoning(e.target.value as ReasoningEffort)}>{reasoningEfforts.map(effort=><option value={effort} key={effort}>{efforts[effort]}</option>)}</select></label></div>
        <p>{t.reasoningHint}</p>{model&&config&&!config.models.includes(model)&&<p>{creationLabels[locale].unavailable}</p>}
      </section>
      {!settingsOpen&&model&&config?.configured&&!config.models.includes(model)&&<p className="pg-header-issue" role="status">{creationLabels[locale].unavailable}</p>}
      {error&&<p className="pg-generation-status pg-header-issue" role="status">{error}</p>}
      {!error&&<span className="pg-header-status" role="status" aria-live="polite">{status}</span>}
    </div>
    <div className="pg-header-action-area">
      <div className="pg-create-column"><div className="pg-generate-stack"><button className="primary-button pg-generate" disabled={busy||!board.nodes.length||!config?.configured||!model||!config.models.includes(model)} title={!board.nodes.length?h.empty:undefined} onClick={onGenerate}><Sparkles size={18}/>{busy?t.generating:t.generate}</button>
        {busy&&<div className="cr-generation-cancel"><button onClick={onCancel}>{creationLabels[locale].cancelGeneration}</button></div>}
        <HoverInformation label={summaryLabels.name} id="pg-generation-summary" className="pg-summary-wrap">
            <dl><dt>{summaryLabels.model}</dt><dd>{model||t.checking}</dd><dt>{t.reasoning}</dt><dd>{efforts[reasoningEffort]}</dd>{board.title.trim()&&<><dt>{t.scene}</dt><dd>{board.title}</dd></>}</dl>
            <h4>{summaryLabels.context}</h4><p>{board.intent.trim()||summaryLabels.none}</p><p className="pg-summary-interpretation">{board.interpretation.trim()?summaryLabels.edited:summaryLabels.automatic}</p>
            {!!board.edges.length&&<><h4>{t.connections}</h4><ul>{board.edges.map(edge=><li key={edge.id}>{board.nodes.find(node=>node.id===edge.source)?.glyph} {edge.label} → {board.nodes.find(node=>node.id===edge.target)?.glyph}</li>)}</ul></>}
        </HoverInformation>
      </div></div>
    </div>
  </section>;
}
