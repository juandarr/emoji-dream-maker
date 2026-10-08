import "server-only";
import { isAbsolute } from "node:path";
import { emojiById } from "@/lib/catalog";
export function accountConfig() {
  const secret=process.env.BETTER_AUTH_SECRET,url=process.env.BETTER_AUTH_URL,path=process.env.ACCOUNT_DB_PATH,phrase=process.env.INVITATION_PHRASE,emoji=process.env.INVITATION_EMOJI_ID;
  if(!secret||secret.length<32||!url||!path||!isAbsolute(path)||!phrase?.trim()||!emoji||!emojiById.has(emoji))throw new Error("Configure BETTER_AUTH_SECRET (32+ characters), BETTER_AUTH_URL, absolute ACCOUNT_DB_PATH, INVITATION_PHRASE, and INVITATION_EMOJI_ID before starting the app.");
  const parsed=new URL(url);
  if(parsed.pathname!=="/"||parsed.search||parsed.hash||parsed.username||parsed.password||!["http:","https:"].includes(parsed.protocol))throw new Error("BETTER_AUTH_URL must be the app origin.");
  if(parsed.protocol!=="https:"&&!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname))throw new Error("Use HTTPS outside localhost.");
  return {secret,url:parsed.origin,path,phrase,emoji,secure:parsed.protocol==="https:"};
}
