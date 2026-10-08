import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { authReady } from '@/features/account/server/auth';
import { database } from '@/features/account/server/database';
let folder:string;
export async function prepareAccountDatabase(){
  folder=mkdtempSync(join(tmpdir(),'emoji-account-test-'));
  vi.stubEnv('BETTER_AUTH_SECRET','test-only-private-auth-secret-at-least-32-characters');vi.stubEnv('BETTER_AUTH_URL','http://localhost');vi.stubEnv('ACCOUNT_DB_PATH',join(folder,'accounts.sqlite'));vi.stubEnv('INVITATION_PHRASE','small symbols infinite possibilities');vi.stubEnv('INVITATION_EMOJI_ID','1F419');
  await authReady();const db=database();
  for(const id of ['test-owner','other-owner'])db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt,username,activatedAt) VALUES(?,?,?,?,?,?,?,?)').run(id,'Test person',`${id}@accounts.invalid`,0,Date.now(),Date.now(),id.replaceAll('-','_'),Date.now());
}
export function closeAccountDatabase(){const global=globalThis as any;global.emojiAccountDb?.db.close();delete global.emojiAccountDb;delete global.emojiAuth;delete global.emojiJobs;if(folder)rmSync(folder,{recursive:true,force:true});}
