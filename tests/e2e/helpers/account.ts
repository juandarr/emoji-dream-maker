import { test as base, expect, type Page, type Route, type Browser, type BrowserContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { compileBrief, semanticIdentity } from '../../../src/features/playground/model';
import { stateIdentity, makeState, type CreationState } from '../../../src/features/playground/creations';

type WorkerAccount={id:string;cookies:Awaited<ReturnType<BrowserContext['storageState']>>['cookies']};
const owners=new WeakMap<Page,string>();
const db=()=>new Database(process.env.ACCOUNT_DB_PATH!);
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function records(page:Page,collection='saved'):Promise<any[]>{return (await page.request.get(`/api/account/creations?collection=${collection}`)).json();}
export async function setAccountPreferences(page:Page,patch:Record<string,unknown>){const response=await page.request.get('/api/account/state'),data=await response.json();const update=await page.request.put('/api/account/state',{headers:{origin:new URL(response.url()).origin},data:{...data,preferences:{...data.preferences,...patch}}});expect(update.ok(),await update.text()).toBe(true);}
export async function seedCreation(page:Page,state:CreationState,collection='temporary'){
  const owner=owners.get(page)||(await (await page.request.get('/api/auth/get-session')).json()).user.id,database=db();
  if(state.run)database.prepare('INSERT OR REPLACE INTO attempts(owner,id,fingerprint,token_hash,status,created_at,payload,outcome) VALUES(?,?,?,?,?,?,?,?)').run(owner,state.run.id,'fixture',digest('fixture-capability'),'succeeded',state.run.createdAt,JSON.stringify(state.run),JSON.stringify({status:200,run:state.run,result:state.run.result}));
  const identity=digest(collection==='temporary'&&state.run?.status!=='succeeded'?JSON.stringify({state:stateIdentity(state),attempt:state.run}):stateIdentity(state));
  database.prepare('INSERT OR REPLACE INTO creations(owner,collection,id,identity,revision,created_at,payload) VALUES(?,?,?,?,1,?,?)').run(owner,collection,state.id,identity,state.createdAt,JSON.stringify(state));database.close();
  await page.evaluate(owner=>window.dispatchEvent(new CustomEvent('dream-maker-creations-changed',{detail:owner})),owner);
}

// Existing UI provider fixtures still intercept responses. Persist their authoritative
// attempt/checkpoint into the isolated server database so the real account repository,
// validation, save, restore and deletion paths remain exercised (no production bypass).
function wrapFixtures(page:Page,owner:string){
  if(owners.has(page))return;owners.set(page,owner);
  const original=page.route.bind(page);
  page.route=((pattern:any,handler:any,options:any)=>original(pattern,async(route:Route)=>{
    const request=route.request(),method=request.method(),url=request.url();
    if(!url.endsWith('/api/generations')||method==='GET')return handler(route,request);
    const input=request.postDataJSON(),database=db(),id=input.requestId;
    if(method==='POST'&&!database.prepare('SELECT 1 FROM attempts WHERE owner=? AND id=?').get(owner,id)){
      const run={id,createdAt:Date.now(),identity:semanticIdentity(input.board,input.settings.locale),board:input.board,settings:input.settings,brief:compileBrief(input.board,input.settings.locale),status:'running'};
      const state={schemaVersion:1 as const,id,createdAt:run.createdAt,board:run.board,settings:run.settings,run} as CreationState;
      database.prepare('INSERT INTO attempts(owner,id,fingerprint,token_hash,status,created_at,payload,outcome) VALUES(?,?,?,?,?,?,?,NULL)').run(owner,id,'fixture',digest(input.cancelToken),'running',run.createdAt,JSON.stringify(run));
      database.prepare("INSERT INTO creations(owner,collection,id,identity,revision,created_at,payload) VALUES(?,'temporary',?,?,1,?,?)").run(owner,id,digest(JSON.stringify({state:stateIdentity(state),attempt:state.run})),state.createdAt,JSON.stringify(state));
    }
    if(method==='DELETE'){
      const old=database.prepare('SELECT payload FROM attempts WHERE owner=? AND id=?').get(owner,id) as {payload:string}|undefined;
      if(old){const run={...JSON.parse(old.payload),status:'canceled',errorCode:'canceled'};database.prepare("UPDATE attempts SET status='canceled',payload=? WHERE owner=? AND id=?").run(JSON.stringify(run),owner,id);const rows=database.prepare("SELECT id,payload FROM creations WHERE owner=? AND collection='temporary' AND json_extract(payload,'$.run.id')=?").all(owner,id) as {id:string;payload:string}[];for(const row of rows)database.prepare("UPDATE creations SET revision=revision+1,payload=? WHERE owner=? AND collection='temporary' AND id=?").run(JSON.stringify({...JSON.parse(row.payload),run}),owner,row.id);}
    }
    database.close();
    const fulfill=route.fulfill.bind(route);
    const proxy=new Proxy(route,{get(target,key){if(key!=='fulfill'){const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}return async(args:any)=>{
      const result=args.json||(args.body?JSON.parse(args.body):{});
      if(method==='POST'){
        const database=db(),old=database.prepare('SELECT status,payload FROM attempts WHERE owner=? AND id=?').get(owner,id) as {status:string;payload:string}|undefined;
        if(old&&old.status!=='canceled'){
          const run={...JSON.parse(old.payload),status:result.result?'succeeded':result.code==='unknown'?'unknown':'failed',...(result.result?{result:result.result}:{errorCode:result.code||'failed'})};
          database.prepare('UPDATE attempts SET status=?,payload=?,outcome=? WHERE owner=? AND id=?').run(run.status,JSON.stringify(run),JSON.stringify(result),owner,id);
          const rows=database.prepare("SELECT id,payload FROM creations WHERE owner=? AND collection='temporary' AND json_extract(payload,'$.run.id')=? AND (deleted_at IS NULL OR undo_until>=?)").all(owner,id,Date.now()) as {id:string;payload:string}[];
          for(const row of rows){const state={...JSON.parse(row.payload),run};database.prepare("UPDATE creations SET identity=?,revision=revision+1,payload=? WHERE owner=? AND collection='temporary' AND id=?").run(digest(stateIdentity(state)),JSON.stringify(state),owner,row.id);}
          result.run=run;
        }else if(old)result.run=JSON.parse(old.payload);
        database.close();
      }
      return fulfill({...args,body:undefined,json:result});
    };}});
    return handler(proxy,request);
  },options)) as Page['route'];
}
export const test=base.extend<{accountIsolation:void}, {account:WorkerAccount}>({
  account:[async({playwright},use,workerInfo)=>{
    const baseURL=workerInfo.project.use.baseURL;
    const api=await playwright.request.newContext({baseURL,extraHTTPHeaders:{origin:baseURL!}}),username=`browser_${workerInfo.workerIndex}_${randomUUID().slice(0,8)}`;
    const response=await api.post('/api/account/register',{data:{username,name:'Browser explorer',password:'browser-test-password-123'}});expect(response.ok(),await response.text()).toBe(true);
    const activated=await api.post('/api/account/activate',{data:{phrase:'small symbols infinite possibilities',emojiId:'1F419'}});expect(activated.ok()).toBe(true);
    const session=await (await api.get('/api/auth/get-session')).json(),storage=await api.storageState();
    await use({id:session.user.id,cookies:storage.cookies});await api.dispose();
  },{scope:'worker'}],
  browser:[async({browser,account},use)=>{
    const proxy=new Proxy(browser,{get(target,key){if(key==='newContext')return async(options:any={})=>{const context=await target.newContext({storageState:{cookies:account.cookies,origins:[]},...options});context.on('page',page=>wrapFixtures(page,account.id));return context;};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}});
    await use(proxy as Browser);
  },{scope:'worker'}],
  accountIsolation:[async({account},use)=>{
    const database=db();for(const table of ['creations','attempts','account_state'])database.prepare(`DELETE FROM ${table} WHERE owner=?`).run(account.id);database.close();await use();
  },{auto:true}],
  page:async({page,context,account},use)=>{
    await context.addCookies(account.cookies);wrapFixtures(page,account.id);context.on('page',newPage=>wrapFixtures(newPage,account.id));await use(page);
  },
});
export {expect};
