"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

export const NOTIFICATION_DURATION = 5000;

/** Each notification gets its own deadline, including repeated identical messages. */
export function useNotification<T>(empty:T) {
  const initial=useRef(empty);
  const [notification,setNotification]=useState({value:empty});
  const setValue=useCallback((next:SetStateAction<T>)=>{
    setNotification(current=>({value:typeof next==="function"?(next as (previous:T)=>T)(current.value):next}));
  },[]);
  useEffect(()=>{
    if(Object.is(notification.value,initial.current))return;
    const timer=setTimeout(()=>{
      // An earlier deadline must never dismiss a newer notification.
      setNotification(current=>current===notification?{value:initial.current}:current);
    },NOTIFICATION_DURATION);
    return()=>clearTimeout(timer);
  },[notification]);
  return [notification.value,setValue] as const;
}
