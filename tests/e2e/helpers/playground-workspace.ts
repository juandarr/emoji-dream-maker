import type { Page } from '@playwright/test';
import type { Composition } from '../../../src/features/playground/model';

export async function savedBoard(page:Page):Promise<Composition> {
  return page.evaluate(()=>new Promise<Composition>((resolve,reject)=>{
    const request=indexedDB.open('dream-maker-playground-v1',1);
    request.onsuccess=()=>{
      const db=request.result,read=db.transaction('workspace').objectStore('workspace').get('active');
      read.onsuccess=()=>{const board=read.result.board;db.close();resolve(board);};
      read.onerror=()=>{db.close();reject(read.error);};
    };
    request.onerror=()=>reject(request.error);
  }));
}

export async function importSavedBoard(page:Page,board:Composition) {
  await page.locator('input[type="file"]').setInputFiles({name:'saved-scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(board))});
}
