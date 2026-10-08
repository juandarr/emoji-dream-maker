import { prepareAccountDatabase, closeAccountDatabase } from "./helpers/account-database";
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emojiById } from '@/lib/catalog';
import { createNode, emptyComposition } from '@/features/playground/model';
vi.mock("@/features/account/server/http",async importOriginal=>({...await importOriginal<typeof import("@/features/account/server/http")>(),requireAccount:async()=>({id:"test-owner",name:"Test person",username:"test_owner",activated:true})}));
const board={...emptyComposition(),nodes:[createNode(emojiById.get('2764')!,'en','heart',0)]};
const settings={kind:'poem',locale:'en',tone:'gentle',model:'test/text'};
const input=()=>({board,settings,requestId:crypto.randomUUID(),cancelToken:crypto.randomUUID()});
const request=(body:unknown,method='POST',origin='http://localhost')=>new NextRequest('http://localhost/api/generations',{method,body:JSON.stringify(body),headers:{origin}});
beforeEach(async()=>{await prepareAccountDatabase();vi.resetModules();vi.stubEnv('OPENROUTER_API_KEY','test-secret');vi.stubEnv('OPENROUTER_MODELS','test/text');});
afterEach(()=>{closeAccountDatabase();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('cancellation before submission prevents a provider call and forbids incorrect capabilities',async()=>{
  const adapter=await import('@/features/generation/server/openrouter');const generate=vi.spyOn(adapter.openRouterGenerator,'generate');const {DELETE,POST}=await import('@/app/api/generations/route');const data=input();
  expect((await DELETE(request(data,'DELETE','https://other.example'))).status).toBe(403);
  expect((await DELETE(request(data,'DELETE'))).status).toBe(200);
  expect((await POST(request({...data,cancelToken:crypto.randomUUID()}))).status).toBe(403);
  expect((await POST(request(data))).status).toBe(409);expect(generate).not.toHaveBeenCalled();
});
it('only the submitting capability cancels, abort propagates, and a retry keeps the canceled outcome',async()=>{
  const adapter=await import('@/features/generation/server/openrouter');let release=()=>{};const deferred=new Promise<void>(resolve=>{release=resolve;});
  const generate=vi.spyOn(adapter.openRouterGenerator,'generate').mockImplementation(async()=>{await deferred;return {text:'Late result',model:'test/text',provider:'openrouter'};});
  const {DELETE,POST}=await import('@/app/api/generations/route');const data=input();const submission=POST(request(data));await vi.waitFor(()=>expect(generate).toHaveBeenCalledTimes(1));
  const signal=generate.mock.calls[0][2]!;expect(signal.aborted).toBe(false);
  expect((await DELETE(request({...data,cancelToken:crypto.randomUUID()},'DELETE'))).status).toBe(403);expect(signal.aborted).toBe(false);
  expect((await DELETE(request(data,'DELETE'))).status).toBe(200);expect(signal.aborted).toBe(true);
  expect((await (await submission).json()).code).toBe('canceled');release();
  expect((await (await POST(request(data))).json()).code).toBe('canceled');expect(generate).toHaveBeenCalledTimes(1);
});
it('the provider transport combines user cancellation with its deadline',async()=>{
  const {openRouterGenerator}=await import('@/features/generation/server/openrouter');let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>{signal=init.signal as AbortSignal;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError'))));}));
  const controller=new AbortController(),pending=openRouterGenerator.generate(board,settings as Parameters<typeof openRouterGenerator.generate>[1],controller.signal);controller.abort();
  await expect(pending).rejects.toThrow(/cancel/i);expect(signal?.aborted).toBe(true);
});
