import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareAccountDatabase, closeAccountDatabase } from './helpers/account-database';
import { authReady } from '@/features/account/server/auth';
import { accountConfig } from '@/features/account/server/config';
import { database } from '@/features/account/server/database';
import { requireAccount, AccountError } from '@/features/account/server/http';
import { POST as register } from '@/app/api/account/register/route';
import { POST as activate } from '@/app/api/account/activate/route';
import { GET as authGet, POST as authPost } from '@/app/api/auth/[...all]/route';
import { GET as stateGet, PUT as statePut } from '@/app/api/account/state/route';
import { GET as creationGet, PUT as creationPut, DELETE as creationDelete } from '@/app/api/account/creations/route';
import { POST as undo } from '@/app/api/account/undo/route';
import { createNode, emptyComposition } from '@/features/playground/model';
import { emojiById } from '@/lib/catalog';
import { makeState } from '@/features/playground/creations';
import { emptyAccountData } from '@/features/account/model';
import { generateForAccount, cancelAttempt, initializeGenerations } from '@/features/account/server/generation';
import { PATCH as generationPersistence } from '@/app/api/generations/route';
import { openRouterGenerator, GenerationError } from '@/features/generation/server/openrouter';
import { listCreations, removeCreations, undoRemoval, putCreation } from '@/features/account/server/creations';
const request=(path:string,body?:unknown,cookie='',method=body===undefined?'GET':'POST')=>new Request(`http://localhost${path}`,{method,headers:{origin:'http://localhost',cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function registration(username='new_user',name='Same display name'){
  const response=await register(request('/api/account/register',{username,name,password:'a-private-password-123'}));
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
}
const board={...emptyComposition(),nodes:[createNode(emojiById.get('2764')!,'en','heart',0)]};
const settings={kind:'poem' as const,locale:'en' as const,tone:'gentle',model:'test/text'};
beforeEach(async()=>{await prepareAccountDatabase();vi.stubEnv('OPENROUTER_API_KEY','test-provider');vi.stubEnv('OPENROUTER_MODELS','test/text');});
afterEach(()=>{closeAccountDatabase();vi.restoreAllMocks();vi.unstubAllEnvs();});
it('registers without email, uses case-insensitive usernames, and permits duplicate display names',async()=>{
  const cookie=await registration('MixedCase');const identity=await requireAccount(new Headers({cookie}),false);expect(identity.username).toBe('mixedcase');expect(identity.activated).toBe(false);
  const duplicate=await register(request('/api/account/register',{username:'mixedcase',name:'Other name',password:'a-private-password-123'}));expect(duplicate.ok).toBe(false);
  await registration('other_new');expect(database().prepare('SELECT COUNT(*) n FROM user WHERE name=?').get('Same display name')).toEqual({n:2});
  const row=database().prepare('SELECT email FROM user WHERE id=?').get(identity.id) as {email:string};expect(row.email.endsWith('@accounts.invalid')).toBe(true);
});
it('blocks inactive accounts and ignores client activation fields; activation persists through logout/login',async()=>{
  const cookie=await registration();expect((await stateGet(request('/api/account/state',undefined,cookie))).status).toBe(403);
  expect((await activate(request('/api/account/activate',{phrase:'wrong',emojiId:'1F419',activatedAt:Date.now()},cookie))).status).toBe(403);
  expect((await activate(request('/api/account/activate',{phrase:' SMALL  SYMBOLS infinite possibilities ',emojiId:'1F419'},cookie))).status).toBe(200);
  expect((await stateGet(request('/api/account/state',undefined,cookie))).status).toBe(200);
  await authPost(request('/api/auth/sign-out',{},cookie));expect((await stateGet(request('/api/account/state',undefined,cookie))).status).toBe(401);
  const response=await authPost(request('/api/auth/sign-in/username',{username:'NEW_USER',password:'a-private-password-123'}));expect(response.status).toBe(200);
  const next=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');expect((await requireAccount(new Headers({cookie:next}))).activated).toBe(true);
});
it('guards every account endpoint and blocks alternate authentication paths and cross-site writes',async()=>{
  for(const run of [()=>stateGet(request('/api/account/state')),()=>creationGet(request('/api/account/creations?collection=saved')),()=>activate(request('/api/account/activate',{}))])expect((await run()).status).toBe(401);
  for(const path of ['sign-up/email','sign-in/email','reset-password','link-social','update-user'])expect((await authPost(request(`/api/auth/${path}`,{}))).status).toBe(404);
  expect((await register(new Request('http://localhost/api/account/register',{method:'POST',headers:{origin:'https://attacker.example'},body:'{}'}))).status).toBe(403);
  expect((await authGet(request('/api/auth/get-session'))).status).toBe(200);
});
it('rejects session expiry and mismatched account-generation headers',async()=>{
  const cookie=await registration();const user=await requireAccount(new Headers({cookie}),false);
  await expect(requireAccount(new Headers({cookie,'x-account-id':'someone_else'}),false)).rejects.toMatchObject({status:401});
  database().prepare('UPDATE session SET expiresAt=? WHERE userId=?').run(Date.now()-1000,user.id);await expect(requireAccount(new Headers({cookie}),false)).rejects.toMatchObject({status:401});
});
it('limits activation attempts and never lets user-provided activation bypass the invitation',async()=>{
  const cookie=await registration();for(let i=0;i<6;i++)expect((await activate(request('/api/account/activate',{phrase:'bad',emojiId:'1F419'},cookie))).status).toBe(403);
  expect((await activate(request('/api/account/activate',{phrase:'small symbols infinite possibilities',emojiId:'1F419'},cookie))).status).toBe(429);
});
it('persists preferences with revision checks, validation and account isolation',async()=>{
  const a=await registration('person_a'),b=await registration('person_b');for(const cookie of [a,b])await activate(request('/api/account/activate',{phrase:'small symbols infinite possibilities',emojiId:'1F419'},cookie));
  const data=emptyAccountData();data.preferences.theme='retro';const saved=await statePut(request('/api/account/state',data,a,'PUT'));expect(saved.status).toBe(200);
  expect((await statePut(request('/api/account/state',data,a,'PUT'))).status).toBe(409);expect((await (await stateGet(request('/api/account/state',undefined,b))).json()).preferences.theme).toBe('classic');
  expect((await statePut(request('/api/account/state',{...data,revision:1,preferences:{...data.preferences,theme:'invalid'}},a,'PUT'))).status).toBe(400);
});
it('saved and temporary collections deduplicate independently, reject stale deletion, and Undo atomically',()=>{
  const state=makeState(board,null);const t=putCreation('test-owner','temporary',state),s=putCreation('test-owner','saved',state);
  expect(putCreation('test-owner','saved',makeState(board,null)).key).toBe(s.key);
  const second=putCreation('test-owner','temporary',makeState({...board,nodes:[{...board.nodes[0],x:30}]},null));
  expect(()=>removeCreations('test-owner','temporary',[t,{...second,revision:999}])).toThrow(AccountError);expect(listCreations('test-owner','temporary')).toHaveLength(2);
  const receipt=removeCreations('test-owner','temporary',[t,second]);expect(listCreations('test-owner','temporary')).toHaveLength(0);expect(listCreations('test-owner','saved')).toHaveLength(1);
  expect(()=>undoRemoval('other-owner',receipt.token)).toThrow();expect(undoRemoval('test-owner',receipt.token)).toHaveLength(2);
});
it('cannot read or remove another account creation or invent a generation provenance',async()=>{
  const a=await registration('record_a'),b=await registration('record_b');for(const cookie of [a,b])await activate(request('/api/account/activate',{phrase:'small symbols infinite possibilities',emojiId:'1F419'},cookie));
  const state=makeState(board,null),stored=await (await creationPut(request('/api/account/creations',{collection:'saved',state},a,'PUT'))).json();
  expect(await (await creationGet(request('/api/account/creations?collection=saved',undefined,b))).json()).toEqual([]);
  expect((await creationDelete(request('/api/account/creations',{collection:'saved',records:[stored]},b,'DELETE'))).status).toBe(409);
  expect((await undo(request('/api/account/undo',{token:'forged'},b))).status).toBe(409);
  expect((await creationPut(request('/api/account/creations',{collection:'temporary',state:{...state,run:{id:'fake'}}},a,'PUT'))).status).toBe(400);
});
it('generation survives client-independent completion; deleting a pending checkpoint does not resurrect it',async()=>{
  let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);vi.spyOn(openRouterGenerator,'generate').mockImplementation(async()=>{await gate;return {text:'Completed',model:'test/text',provider:'openrouter'};});
  const id=crypto.randomUUID(),token=crypto.randomUUID(),pending=generateForAccount('test-owner',id,token,board,settings);
  const row=listCreations('test-owner','temporary')[0];expect(row.state.run?.status).toBe('running');const receipt=removeCreations('test-owner','temporary',[row]);release();expect((await pending).result?.text).toBe('Completed');expect(listCreations('test-owner','temporary')).toHaveLength(0);
  expect(undoRemoval('test-owner',receipt.token)[0].state.run?.result?.text).toBe('Completed');
});
it('cancellation wins over late completion and survives a new runtime without resubmitting',async()=>{
  let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);const generate=vi.spyOn(openRouterGenerator,'generate').mockImplementation(async()=>{await gate;return {text:'Late',model:'test/text',provider:'openrouter'};});
  const id=crypto.randomUUID(),token=crypto.randomUUID(),pending=generateForAccount('test-owner',id,token,board,settings);
  expect(()=>cancelAttempt('test-owner',id,crypto.randomUUID())).toThrow();cancelAttempt('test-owner',id,token);release();expect((await pending).code).toBe('canceled');
  delete (globalThis as any).emojiJobs;expect((await generateForAccount('test-owner',id,token,board,settings)).code).toBe('canceled');expect(generate).toHaveBeenCalledTimes(1);
  const early=crypto.randomUUID();cancelAttempt('test-owner',early,token);expect((await generateForAccount('test-owner',early,token,board,settings)).code).toBe('canceled');
});
it('reconciles interrupted running attempts without a provider retry',async()=>{
  initializeGenerations();const run={id:crypto.randomUUID(),createdAt:Date.now(),board,settings,brief:{interpretation:'Love'},identity:'test',status:'running'};
  database().prepare('INSERT INTO attempts(owner,id,fingerprint,token_hash,status,created_at,payload,outcome) VALUES(?,?,?,?,?,?,?,NULL)').run('test-owner',run.id,'input','token','running',run.createdAt,JSON.stringify(run));
  delete (globalThis as any).emojiJobs;initializeGenerations();expect(database().prepare('SELECT status FROM attempts WHERE id=?').get(run.id)).toEqual({status:'unknown'});
});
it('expired Undo cannot resurrect a removed record and does not remove saved membership',()=>{
  const state=makeState(board,null),t=putCreation('test-owner','temporary',state);putCreation('test-owner','saved',state);const receipt=removeCreations('test-owner','temporary',[t]);database().prepare('UPDATE creations SET undo_until=? WHERE collection=?').run(Date.now()-1,'temporary');
  expect(listCreations('test-owner','temporary')).toHaveLength(0);expect(()=>undoRemoval('test-owner',receipt.token)).toThrow();expect(listCreations('test-owner','saved')).toHaveLength(1);
});
it('an editor can explicitly save after deleting all checkpoints, while terminal retries do not return deleted output',async()=>{
  vi.spyOn(openRouterGenerator,'generate').mockResolvedValue({text:'Authored output',model:'test/text',provider:'openrouter',usage:{promptTokens:3,completionTokens:4}});
  const id=crypto.randomUUID(),token=crypto.randomUUID(),outcome=await generateForAccount('test-owner',id,token,board,settings);
  const row=listCreations('test-owner','temporary')[0];removeCreations('test-owner','temporary',[row]);database().prepare("UPDATE creations SET undo_until=? WHERE owner=?").run(Date.now()-1,'test-owner');listCreations('test-owner','temporary');
  expect((await generateForAccount('test-owner',id,token,board,settings)).code).toBe('deleted');
  const state=makeState(board,settings,outcome.run!);state.run!.result!.text='My edited version';
  expect(putCreation('test-owner','saved',state).state.run?.result?.text).toBe('My edited version');
  const forged=structuredClone(state);forged.id=crypto.randomUUID();forged.run!.result!.model='pretend/provider';expect(()=>putCreation('test-owner','saved',forged)).toThrow();
});
it('startup migrations are repeatable and account records survive a database reopen',async()=>{
  const state=makeState(board,null);putCreation('test-owner','saved',state);const global=globalThis as any;global.emojiAccountDb.db.close();delete global.emojiAccountDb;delete global.emojiAuth;delete global.emojiJobs;
  await authReady();expect(listCreations('test-owner','saved')[0].state.board).toEqual(board);
  expect(database().prepare('SELECT version FROM app_migrations ORDER BY version').all()).toEqual([{version:1},{version:2},{version:3}]);
});
it('a full-disk persistence failure never submits the provider, and a failed final write retries storage only',async()=>{
  const generate=vi.spyOn(openRouterGenerator,'generate').mockResolvedValue({text:'Completed',model:'test/text',provider:'openrouter'});
  database().exec("CREATE TRIGGER fail_attempt BEFORE INSERT ON attempts BEGIN SELECT RAISE(FAIL,'disk full'); END;");
  await expect(generateForAccount('test-owner',crypto.randomUUID(),crypto.randomUUID(),board,settings)).rejects.toThrow();expect(generate).not.toHaveBeenCalled();
  database().exec('DROP TRIGGER fail_attempt; CREATE TRIGGER fail_completion BEFORE UPDATE ON attempts BEGIN SELECT RAISE(FAIL,\'disk full\'); END;');
  const id=crypto.randomUUID(),token=crypto.randomUUID(),pending=await generateForAccount('test-owner',id,token,board,settings);expect(pending.persistencePending).toBe(true);expect(pending.run?.result?.text).toBe('Completed');expect((await generateForAccount('test-owner',id,token,board,settings)).status).toBe(503);
  database().exec('DROP TRIGGER fail_completion;');const {retryGenerationPersistence}=await import('@/features/account/server/generation');expect(retryGenerationPersistence('test-owner',id,token).result?.text).toBe('Completed');expect(generate).toHaveBeenCalledTimes(1);
});

it('storage-only retry acknowledges a persisted provider failure with HTTP success',async()=>{
  const cookie=await registration();await activate(request('/api/account/activate',{phrase:'small symbols infinite possibilities',emojiId:'1F419'},cookie));const owner=(await requireAccount(new Headers({cookie}))).id;
  vi.spyOn(openRouterGenerator,'generate').mockRejectedValue(new GenerationError('unknown',502,'Provider ended unexpectedly'));
  database().exec("CREATE TRIGGER fail_completion BEFORE UPDATE ON attempts BEGIN SELECT RAISE(FAIL,'disk full'); END;");
  const id=crypto.randomUUID(),token=crypto.randomUUID();expect((await generateForAccount(owner,id,token,board,settings)).persistencePending).toBe(true);
  database().exec('DROP TRIGGER fail_completion;');
  const response=await generationPersistence(request('/api/generations',{requestId:id,cancelToken:token},cookie,'PATCH'));expect(response.status).toBe(200);expect((await response.json()).run.status).toBe('unknown');
});

it('validates startup secrets, invitation configuration and HTTPS before serving',()=>{
  expect(accountConfig().secure).toBe(false);vi.stubEnv('BETTER_AUTH_URL','https://example.test');expect(accountConfig().secure).toBe(true);
  vi.stubEnv('BETTER_AUTH_URL','http://example.test');expect(()=>accountConfig()).toThrow('HTTPS');
  vi.stubEnv('BETTER_AUTH_URL','http://localhost');vi.stubEnv('INVITATION_EMOJI_ID','unknown');expect(()=>accountConfig()).toThrow('Configure');
  vi.stubEnv('INVITATION_EMOJI_ID','1F419');vi.stubEnv('BETTER_AUTH_SECRET','short');expect(()=>accountConfig()).toThrow('Configure');
});
it('upgrades existing version-2 creations without changing their content or ownership',async()=>{
  const saved=putCreation('test-owner','saved',makeState(board,null));const db=database();
  db.exec('ALTER TABLE creations DROP COLUMN updated_at; ALTER TABLE attempts DROP COLUMN updated_at; DELETE FROM app_migrations WHERE version=3;');
  const global=globalThis as any;db.close();delete global.emojiAccountDb;delete global.emojiAuth;delete global.emojiJobs;
  await authReady();const restored=listCreations('test-owner','saved')[0];expect(restored.state).toEqual(saved.state);expect(restored.namespace).toBe('test-owner');expect(restored.updatedAt).toBe(restored.state.createdAt);
});

it('another account cannot cancel, recover or save an owned generation outcome',async()=>{
  let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);const generate=vi.spyOn(openRouterGenerator,'generate').mockImplementation(async()=>{await gate;return {text:'Owned output',model:'test/text',provider:'openrouter'};});
  const id=crypto.randomUUID(),token=crypto.randomUUID(),pending=generateForAccount('test-owner',id,token,board,settings);
  cancelAttempt('other-owner',id,token);expect(listCreations('test-owner','temporary')[0].state.run?.status).toBe('running');expect(listCreations('other-owner','temporary')).toEqual([]);
  release();const outcome=await pending;expect(outcome.run?.status).toBe('succeeded');expect((await generateForAccount('other-owner',id,token,board,settings)).code).toBe('canceled');expect(generate).toHaveBeenCalledTimes(1);
  expect(()=>putCreation('other-owner','saved',makeState(board,settings,outcome.run!))).toThrow();
});
