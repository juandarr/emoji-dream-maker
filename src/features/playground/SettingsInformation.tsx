"use client";

import HoverInformation from "./HoverInformation";
import type { Locale } from "@/lib/types";
import { playgroundLabels } from "./labels";
import type { GenerationConfig } from "./CreationHeader";

export default function SettingsInformation({locale,config,configFailed,onCheck,onCopy,canCopy}:{locale:Locale;config:GenerationConfig|null;configFailed:boolean;onCheck:()=>void;onCopy:()=>void;canCopy:boolean}) {
  const t=playgroundLabels[locale];
  const name=locale==="es"?"Información de ajustes":"Settings information";
  const issue=configFailed||!!config&&!config.configured;
  return <HoverInformation label={name} id="pg-settings-information" className="pg-settings-info-wrap" panelClassName="pg-settings-information" role="dialog" issue={issue}>
      <div className="pg-settings-information-scroll">
      <h3>{locale==="es"?"Antes de generar":"Before you generate"}</h3>
      <p>{t.cap.replace("{tokens}",(config?.maxOutputTokens||8192).toLocaleString(locale))}</p>
      <p>{t.mediaHint}</p><p>{t.sending}</p>
      <p>{locale==="es"?"Al actualizar la página se reinician el lienzo y el resultado actual. Las creaciones temporales y guardadas se conservan hasta que las elimines.":"Refreshing starts a new canvas and clears the current result. Temporary and saved creations remain until you remove them."}</p>
      <div className="pg-settings-connection"><p role="status">{configFailed?t.checkFailed:!config?t.checking:config.configured?t.connected:t.setup}</p>{(!config||!config.configured||configFailed)&&<button className="pg-link" disabled={!config&&!configFailed} onClick={onCheck}>{t.check}</button>}</div>
      <button className="pg-link" disabled={!canCopy} onClick={onCopy}>{t.localMessage}</button>
      </div>
  </HoverInformation>;
}
