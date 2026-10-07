import type { Metadata } from "next";
import "./globals.css";
import "./themes.css";
import { storageKey } from "@/lib/storage";
import { themeInitializationScript } from "@/lib/themes";
export const metadata: Metadata = { title:"Dream Maker · An emoji explorer", description:"Small symbols. Infinite possibilities. Explore a world of videos, sounds, art, and ideas through emojis." };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" data-theme="classic" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInitializationScript(storageKey)}}/></head><body>{children}</body></html>;
}
