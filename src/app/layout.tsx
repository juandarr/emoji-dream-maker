import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Dream Maker · An emoji explorer", description:"Small symbols. Infinite possibilities. Explore a world of videos, sounds, art, and ideas through emojis." };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
