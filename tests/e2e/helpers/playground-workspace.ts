import { expect, type Page } from '@playwright/test';
import type { Composition } from '../../../src/features/playground/model';
import { playgroundLabels } from '../../../src/features/playground/labels';

export async function savedBoard(page:Page):Promise<Composition> {
  await page.locator('.cr-action-buttons button').first().click();
  await expect(page.locator('.storage-notice')).toContainText(/Kept in temporary history|Conservado en el historial temporal/);
  return page.evaluate(()=>new Promise<Composition>((resolve,reject)=>{
    const request=indexedDB.open('dream-maker-playground-v1',2);
    request.onsuccess=()=>{
      const db=request.result,read=db.transaction('creations').objectStore('creations').index('membership').getAll(['local','temporary']);
      read.onsuccess=()=>{const rows=read.result.sort((a,b)=>b.state.createdAt-a.state.createdAt);db.close();resolve(rows[0].state.board);};
      read.onerror=()=>{db.close();reject(read.error);};
    };
    request.onerror=()=>reject(request.error);
  }));
}

/** Seed an experiment through browser storage, then use the actual partial restore UI. */
export async function restoreBoard(page:Page,board:unknown) {
  const fullscreen=await page.locator(".pg-stage").evaluate(el=>el.classList.contains("is-fullscreen"));
  if(fullscreen)await page.getByRole("button",{name:/^(Exit fullscreen|Salir de pantalla completa)$/,exact:true}).click();
  const locale=await page.evaluate(()=>document.documentElement.lang==='es'?'es':'en');
  const model=await page.locator('#pg-generation-settings select').nth(1).inputValue();
  const kind=await page.locator('.pg-format select').inputValue();
  const id=await page.evaluate(async({board,locale,model,kind,tone})=>{
    const id=crypto.randomUUID();
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('dream-maker-playground-v1',2);request.onsuccess=()=>{const db=request.result,tx=db.transaction('creations','readwrite');tx.objectStore('creations').put({key:`local:temporary:${id}`,namespace:'local',collection:'temporary',identity:`fixture-${id}`,revision:1,state:{schemaVersion:1,id,createdAt:Date.now(),board,settings:{kind,locale,model,tone,reasoningEffort:'default'},run:null}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
    window.dispatchEvent(new CustomEvent('dream-maker-creations-changed',{detail:'local'}));return id;
  },{board,locale,model,kind,tone:playgroundLabels[locale].toneDefault});
  await page.locator(`[data-state-id="${id}"] .cr-open`).click();
  const reader=page.locator('dialog.pg-reader');await reader.locator('.cr-partial-restore summary').click();
  await reader.getByRole('button',{name:locale==='es'?'Restaurar selección':'Restore selected',exact:true}).click();
  const discard=page.getByRole('button',{name:locale==='es'?'Descartar y continuar':'Discard and continue',exact:true});
  if(await discard.isVisible())await discard.click();
  if(fullscreen)await page.getByRole("button",{name:locale==='es'?'Entrar en pantalla completa':'Enter fullscreen',exact:true}).click();
}
