"use client";

import { useEffect, useState } from "react";
import { messages } from "@/lib/i18n";
import { readPreferences } from "@/lib/storage";
import type { Locale } from "@/lib/types";

export default function NotFound() {
  const [locale,setLocale]=useState<Locale>("en");
  useEffect(()=>{try{setLocale(readPreferences(window.localStorage).locale);}catch{/* Use English if browser storage is unavailable. */}},[]);
  const t=messages[locale];
  useEffect(()=>{
    document.documentElement.lang=locale;
    document.title=`${t.pageMissing} · Dream Maker`;
  },[locale,t.pageMissing]);
  return <main className="missing-page" aria-labelledby="missing-heading">
    <div><p className="eyebrow">Dream Maker · 404</p><h1 id="missing-heading">{t.pageMissing}</h1><p>{t.pageMissingHint}</p><a className="primary-button" href="/">{t.returnDiscover}</a></div>
  </main>;
}
