import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { username } from "better-auth/plugins/username";
import { getMigrations } from "better-auth/db/migration";
import { accountConfig } from "./config";
import { database } from "./database";

function authOptions(){
  const config=accountConfig();
  return {database:database(),secret:config.secret,baseURL:config.url,trustedOrigins:[config.url],
    emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:true},
    user:{additionalFields:{activatedAt:{type:"number",required:false,input:false,defaultValue:0}}},
    session:{expiresIn:7*24*60*60,cookieCache:{enabled:false}},
    account:{accountLinking:{enabled:false}},
    advanced:{useSecureCookies:config.secure,defaultCookieAttributes:{httpOnly:true,sameSite:"lax",secure:config.secure}},
    rateLimit:{enabled:true,storage:"database",window:60,max:40,customRules:{"/get-session":false,"/sign-in/username":{window:60,max:6}}},
    disabledPaths:["/sign-up/email","/sign-in/email","/request-password-reset","/reset-password","/forget-password","/change-email","/link-social","/sign-in/social","/update-user","/delete-user"],
    plugins:[username({minUsernameLength:3,maxUsernameLength:30,usernameValidator:value=>/^[a-zA-Z0-9_.]{3,30}$/.test(value),usernameNormalization:value=>value.toLowerCase(),immutableUsername:true})],
  } satisfies BetterAuthOptions;
}
function createAuth(options:ReturnType<typeof authOptions>){return betterAuth(options);}
type Auth=ReturnType<typeof createAuth>;
const singleton=globalThis as typeof globalThis & { emojiAuth?:{path:string;ready:Promise<Auth>} };
export async function authReady(){
  const config=accountConfig();
  if(singleton.emojiAuth?.path===config.path){return await singleton.emojiAuth.ready;}
  const ready=(async()=>{const options=authOptions();const migration=await getMigrations(options);await migration.runMigrations();const auth=createAuth(options);await auth.$context;return auth;})();
  singleton.emojiAuth={path:config.path,ready};
  try{return await ready;}catch(error){singleton.emojiAuth=undefined;throw error;}
}
