import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";
import { emojiById } from "./catalog";
import type { Locale } from "./types";

/** Avoid English-only library defaults and internal IDs in screen-reader announcements. */
export function dragAccessibility(locale: Locale, canvas = false): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  const spanish = locale === "es";
  const name = (id: string | number) => emojiById.get(String(id).replace(/^tray:/, ""))?.labels[locale] || "emoji";
  const destination = canvas ? (spanish ? "el lienzo" : "the canvas") : (spanish ? "el portal" : "the portal");
  return {
    screenReaderInstructions: { draggable: spanish
      ? "Pulsa Intro para seleccionar o añadir un emoji. Para arrastrarlo, pulsa Espacio, usa las flechas para moverlo y pulsa Espacio para soltarlo. Pulsa Escape para cancelar."
      : "Press Enter to select or add an emoji. To drag it, press Space, use the arrow keys to move, and press Space to drop. Press Escape to cancel." },
    announcements: {
      onDragStart: ({ active }) => spanish ? `Has recogido ${name(active.id)}.` : `Picked up ${name(active.id)}.`,
      onDragOver: ({ active, over }) => over ? (spanish ? `${name(active.id)} está sobre ${destination}.` : `${name(active.id)} is over ${destination}.`) : undefined,
      onDragEnd: ({ active, over }) => over ? (spanish ? `Has soltado ${name(active.id)} en ${destination}.` : `Dropped ${name(active.id)} into ${destination}.`) : (spanish ? `Has soltado ${name(active.id)} fuera de ${destination}.` : `Dropped ${name(active.id)} outside ${destination}.`),
      onDragCancel: ({ active }) => spanish ? `Se canceló el arrastre de ${name(active.id)}.` : `Dragging ${name(active.id)} was cancelled.`,
    },
  };
}
