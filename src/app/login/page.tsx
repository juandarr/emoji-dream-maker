import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthScreen from "@/features/account/AuthScreen";
import { AccountError, requireAccount } from "@/features/account/server/http";
export default async function Login(){let account;try{account=await requireAccount(await headers(),false);}catch(error){if(!(error instanceof AccountError)&&error instanceof Error)throw error;}if(account)redirect(account.activated?"/":"/waiting-room");return <AuthScreen/>;}
