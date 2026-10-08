import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthScreen from "@/features/account/AuthScreen";
import { AccountError, requireAccount } from "@/features/account/server/http";
export default async function WaitingRoom(){let account;try{account=await requireAccount(await headers(),false);}catch(error){if(error instanceof AccountError)redirect("/login");throw error;}if(account.activated)redirect("/");return <AuthScreen account={account}/>;}
