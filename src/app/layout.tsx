import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./themes.css";
import "./theme-components.css";
import { AccountError, requireAccount } from "@/features/account/server/http";
import { readAccountData } from "@/features/account/server/state";
export const metadata: Metadata = { title:"Dream Maker · An emoji explorer", description:"Small symbols. Infinite possibilities. Explore a world of videos, sounds, art, and ideas through emojis." };
export default async function RootLayout({children}:{children:React.ReactNode}) {
  let locale="en",theme="classic";try{const account=await requireAccount(await headers(),false);if(account.activated){const data=readAccountData(account.id);locale=data.preferences.locale;theme=data.preferences.theme;}}catch(error){if(!(error instanceof AccountError))throw error;}
  return <html lang={locale} data-theme={theme} suppressHydrationWarning><body>{children}</body></html>;
}
