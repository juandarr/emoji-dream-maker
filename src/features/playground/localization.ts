import { defaultTopic, emojiById } from "@/lib/catalog";
import type { Locale } from "@/lib/types";
import type { BoardNode } from "./model";

/** Catalog labels follow the interface language; unknown imported symbols keep their labels. */
export function nodeLabel(node: BoardNode, locale: Locale): string {
  const emoji = emojiById.get(node.emojiId);
  return emoji?.variants.find(variant => variant.glyph === node.glyph)?.labels[locale] || emoji?.labels[locale] || node.label;
}

/** Translate automatic meanings without rewriting the author's board or custom meanings. */
export function nodeMeaning(node: BoardNode, locale: Locale): string {
  const emoji = emojiById.get(node.emojiId);
  if (emoji && node.customMeaning !== true && ["en", "es"].some(language => defaultTopic(emoji, language as Locale).label === node.meaning)) {
    return defaultTopic(emoji, locale).label;
  }
  return node.meaning;
}
