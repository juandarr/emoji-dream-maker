import { headers } from "next/headers";
import { messages } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { AccountError, requireAccount } from "@/features/account/server/http";
import { readAccountData } from "@/features/account/server/state";

export default async function NotFound() {
  let locale:Locale="en";
  try{const account=await requireAccount(await headers(),false);if(account.activated)locale=readAccountData(account.id).preferences.locale;}
  catch(error){if(!(error instanceof AccountError))throw error;}
  const t=messages[locale];
  return <main className="missing-page" aria-labelledby="missing-heading">
    <div><p className="eyebrow">Dream Maker · 404</p><h1 id="missing-heading">{t.pageMissing}</h1><p>{t.pageMissingHint}</p><a className="primary-button" href="/">{t.returnDiscover}</a></div>
  </main>;
}
