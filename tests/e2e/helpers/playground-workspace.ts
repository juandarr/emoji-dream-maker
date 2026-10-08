import { expect, type Page } from '@playwright/test';
import type { Composition } from '../../../src/features/playground/model';
import { playgroundLabels } from '../../../src/features/playground/labels';

export async function savedBoard(page:Page):Promise<Composition> {
  await page.locator('.cr-action-buttons button').first().click();
  await expect(page.locator('.storage-notice')).toContainText(/Kept in temporary history|Conservado en el historial temporal/);
  await expect(page.locator('.cr-action-buttons button').first()).toBeEnabled();
  const rows=await (await page.request.get('/api/account/creations?collection=temporary')).json();
  return rows[0].state.board;

}

/** Seed an experiment through the account repository, then use the actual partial restore UI. */
export async function restoreBoard(page:Page,board:unknown) {
  const fullscreen=await page.locator(".pg-stage").evaluate(el=>el.classList.contains("is-fullscreen"));
  if(fullscreen)await page.getByRole("button",{name:/^(Exit fullscreen|Salir de pantalla completa)$/,exact:true}).click();
  const locale=await page.evaluate(()=>document.documentElement.lang==='es'?'es':'en');
  const model=await page.locator('#pg-generation-settings select').nth(1).inputValue();
  const kind=await page.locator('.pg-format select').inputValue();
  const attemptedId=crypto.randomUUID();
  const response=await page.request.put('/api/account/creations',{headers:{origin:new URL(page.url()).origin},data:{collection:'temporary',state:{schemaVersion:1,id:attemptedId,createdAt:Date.now(),board,settings:{kind,locale,model,tone:playgroundLabels[locale].toneDefault,reasoningEffort:'default'},run:null}}});
  expect(response.ok(),await response.text()).toBe(true);
  const row=await response.json(),id=row.state.id,owner=row.namespace;
  await page.evaluate(owner=>window.dispatchEvent(new CustomEvent('dream-maker-creations-changed',{detail:owner})),owner);
  await page.locator(`[data-state-id="${id}"] .cr-open`).click();
  const reader=page.locator('dialog.pg-reader');await reader.locator('.cr-partial-restore summary').click();
  await reader.getByRole('button',{name:locale==='es'?'Restaurar selección':'Restore selected',exact:true}).click();
  const discard=page.getByRole('button',{name:locale==='es'?'Descartar y continuar':'Discard and continue',exact:true});
  if(await discard.isVisible())await discard.click();
  if(fullscreen)await page.getByRole("button",{name:locale==='es'?'Entrar en pantalla completa':'Enter fullscreen',exact:true}).click();
}
