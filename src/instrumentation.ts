export async function register(){if(process.env.NEXT_RUNTIME==="nodejs"){
  const {authReady}=await import("@/features/account/server/auth");await authReady();
  const {initializeGenerations}=await import("@/features/account/server/generation");initializeGenerations();
}}
