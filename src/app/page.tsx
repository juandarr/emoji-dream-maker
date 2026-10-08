import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountWorkspace from "@/features/account/AccountWorkspace";
import { AccountError, requireAccount } from "@/features/account/server/http";
import { readAccountData } from "@/features/account/server/state";
import { listCreations } from "@/features/account/server/creations";
import { groupCreations } from "@/features/playground/creations";
export default async function Page(){let account;try{account=await requireAccount(await headers(),false);}catch(error){if(error instanceof AccountError)redirect("/login");throw error;}if(!account.activated)redirect("/waiting-room");
  const data=readAccountData(account.id);listCreations(account.id,"temporary");const saved=listCreations(account.id,"saved");
  return <AccountWorkspace identity={account} initialData={data} savedCount={groupCreations(saved).length}/>;
}
