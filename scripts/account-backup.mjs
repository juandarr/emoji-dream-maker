import Database from 'better-sqlite3';
import { chmod, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const source=process.env.ACCOUNT_DB_PATH,destination=process.argv[2];
if(!source||!destination)throw new Error('Set ACCOUNT_DB_PATH and pass a backup destination.');
const target=resolve(destination);if(target===resolve(source))throw new Error('The backup must use a different file.');
await mkdir(dirname(target),{recursive:true,mode:0o700});
const db=new Database(source,{readonly:true,fileMustExist:true});
try{await db.backup(target);await chmod(target,0o600);console.log(`Account database backed up to ${target}`);}finally{db.close();}
