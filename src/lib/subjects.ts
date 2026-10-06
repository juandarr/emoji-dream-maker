import { catalog } from "./catalog";
import type { EmojiRecord, Locale } from "./types";

type Subject = {
  id: string;
  icon: string;
  labels: Record<Locale, string>;
  glyphs: string;
};

// Curated from the full emoji catalog. Subjects may overlap; standard Unicode
// categories still provide access to emojis that do not fit any subject.
export const subjects: Subject[] = [
  {
    id: "ocean", icon: "🌊", labels: { en: "Ocean", es: "Océano" },
    glyphs: [
      "🌊 🐚 🪸 🪼 🐟 🐠 🐡 🦈 🐙 🦑 🦀 🦞 🦐 🦪 🐬 🐳 🐋 🫍 🦭",
      "🏖️ 🏝️ 🏄 🏄‍♂️ 🏄‍♀️ 🤿 🏊 🏊‍♂️ 🏊‍♀️ 🎣",
      "⚓ ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 🛟",
    ].join(" "),
  },
  {
    id: "music", icon: "🎵", labels: { en: "Music", es: "Música" },
    glyphs: [
      "🎵 🎶 🎼 🎤 🎙️ 🎧 🔈 🔉 🔊 📻 🎚️ 🎛️",
      "🎷 🎺 🪊 🪗 🎸 🎹 🎻 🪕 🥁 🪘 🪇 🪈 🪉",
      "🧑‍🎤 👨‍🎤 👩‍🎤 💃 🕺 🪩",
    ].join(" "),
  },
  {
    id: "love", icon: "❤️", labels: { en: "Love", es: "Amor" },
    glyphs: [
      "❤️ 🥰 🫶 💕 💘 💖 💌 💑 💏 💐 🌹 💍 😍 😘 🫂",
      "💝 💗 💓 💞 💟 ❣️ 💔 ❤️‍🔥 ❤️‍🩹 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍",
      "😗 😚 😙 😻 😽 🤗 💋 🫰 🤟",
      "👩‍❤️‍👨 👨‍❤️‍👨 👩‍❤️‍👩 👩‍❤️‍💋‍👨 👨‍❤️‍💋‍👨 👩‍❤️‍💋‍👩 🧑‍🤝‍🧑 👭 👫 👬",
      "💒 🏩 🪉",
    ].join(" "),
  },
  {
    id: "space", icon: "🪐", labels: { en: "Space", es: "Espacio" },
    glyphs: [
      "🪐 🌌 🌙 🌟 ⭐ 🌠 ☄️ 🚀 🛰️ 🛸 👽 👾 🔭",
      "🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌚 🌛 🌜 🌝",
      "☀️ 🌞 🌍 🌎 🌏 🌐 🧑‍🚀 👨‍🚀 👩‍🚀",
    ].join(" "),
  },
  {
    id: "sports", icon: "⚽", labels: { en: "Sports", es: "Deportes" },
    glyphs: [
      "⚽ ⚾ 🥎 🏀 🏐 🏈 🏉 🎾 🥏 🎳 🏏 🏑 🏒 🥍 🏓 🏸 🥊 🥋 🥅 ⛳ ⛸️ 🎿 🛷 🥌 🎯 🎱 🏹",
      "🏆 🏅 🥇 🥈 🥉 🏟️ 🏁 🏎️ 🛹 🛼 🎽 🎣 🤿",
      "🏃 🧗 🤺 🏇 ⛷️ 🏂 🏌️ 🏄 🏊 ⛹️ 🏋️ 🚴 🚵 🤼 🤽 🤾",
      "🏃‍♂️ 🏃‍♀️ 🧗‍♂️ 🧗‍♀️ 🏌️‍♂️ 🏌️‍♀️ 🏄‍♂️ 🏄‍♀️ 🏊‍♂️ 🏊‍♀️ ⛹️‍♂️ ⛹️‍♀️ 🏋️‍♂️ 🏋️‍♀️",
      "🚴‍♂️ 🚴‍♀️ 🚵‍♂️ 🚵‍♀️ 🤼‍♂️ 🤼‍♀️ 🤽‍♂️ 🤽‍♀️ 🤾‍♂️ 🤾‍♀️",
    ].join(" "),
  },
  {
    id: "clothes", icon: "👕", labels: { en: "Clothes", es: "Ropa" },
    glyphs: [
      "👕 👖 👗 👚 🧥 👔 👟 👠 🧢 👒 🧣 🧤 🧦 👘 🥻 🥼 🦺",
      "👓 🕶️ 🥽 🩱 🩲 🩳 👙 🎽",
      "👛 👜 👝 🎒 🩴 👞 🥾 🥿 👡 🩰 👢",
      "👑 🎩 🎓 🪖 ⛑️ 💄 💍",
    ].join(" "),
  },
  {
    id: "tools", icon: "🔨", labels: { en: "Tools", es: "Herramientas" },
    glyphs: [
      "🔨 🔧 🪛 🪚 ⚒️ 🛠️ 🪓 ⛏️ 🧰 🔩 ⚙️ 🗜️ 🪜 🪏",
      "✂️ 📏 📐 🧲 🪝 🖌️ 🪡 🔦",
      "🪠 🧹 🪣 🪤 🧯",
    ].join(" "),
  },
  {
    id: "birds", icon: "🦉", labels: { en: "Birds", es: "Aves" },
    glyphs: [
      "🐦 🦉 🦅 🦆 🦢 🦜 🐧 🐓 🦩 🕊️",
      "🐔 🦃 🐣 🐤 🐥 🦤 🦚 🐦‍⬛ 🪿 🐦‍🔥",
      "🪶 🪽 🪹 🪺",
    ].join(" "),
  },
  {
    id: "fish", icon: "🐟", labels: { en: "Fish", es: "Peces" },
    glyphs: [
      "🐟 🐠 🐡 🦈",
    ].join(" "),
  },
  {
    id: "weather", icon: "🌤️", labels: { en: "Weather", es: "Clima" },
    glyphs: [
      "☀️ 🌞 ☁️ ⛅ 🌤️ 🌥️ 🌦️ 🌧️ 🌨️ 🌩️ ⛈️ 🌪️ 🌫️ 🌬️ 🌀 🌈",
      "🌡️ ⚡ ❄️ ☃️ ⛄ ☂️ ☔ 🌂",
    ].join(" "),
  },
  {
    id: "travel", icon: "✈️", labels: { en: "Travel", es: "Viajes" },
    glyphs: [
      "🌍 🌎 🌏 🗺️ 🗾 🧭 🧳 🎫 🛂 🛄 🛅 🏨 🛎️",
      "✈️ 🛩️ 🛫 🛬 🚁 🚂 🚃 🚄 🚅 🚆 🚇 🚈 🚉 🚊 🚝 🚞 🚋 🚟 🚠 🚡",
      "🚌 🚍 🚎 🚐 🚕 🚖 🚗 🚘 🚙 🛻 🏍️ 🛵 🛺 🚲 🛴 🚏 🛣️ 🛤️",
      "⛵ 🛶 🚤 🛳️ ⛴️ 🛥️ 🚢 ⚓",
      "🏕️ 🏖️ 🏝️ 🏞️ ⛺ 🗼 🗽 🏯 🏰 🗻",
    ].join(" "),
  },
  {
    id: "home", icon: "🏠", labels: { en: "Home", es: "Hogar" },
    glyphs: [
      "🏠 🏡 🏘️ 🛖 🛏️ 🛋️ 🪑 🚪 🪟 🪞 🪴",
      "🚽 🚿 🛁 🪠 🪤 🧹 🧺 🧻 🪣 🧼 🫧 🪥 🧽 🧯",
      "💡 🕯️ 🍳 🫖 🍽️ 🍴 🥄 🔪 🫙",
    ].join(" "),
  },
  {
    id: "health", icon: "🩺", labels: { en: "Health", es: "Salud" },
    glyphs: [
      "🩺 💊 💉 🩹 🩸 🩼 🩻 🏥 🚑 ⚕️ 🥼",
      "🧑‍⚕️ 👨‍⚕️ 👩‍⚕️ 🧠 🫀 🫁 🦷 🦴 🦠",
      "😷 🤒 🤕 🤢 🤮 🤧",
    ].join(" "),
  },
  {
    id: "technology", icon: "💻", labels: { en: "Technology", es: "Tecnología" },
    glyphs: [
      "💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 📱 📲 ☎️ 📞 📟 📠",
      "🔋 🪫 🔌 💽 💾 💿 📀 📷 📸 📹 🎥 📽️ 🎞️ 📺 📼",
      "🎮 🕹️ 🤖 📡 🛰️ 💡 🔈 🔉 🔊 🎧 📻 🎙️ ⚙️",
    ].join(" "),
  },
  {
    id: "plants", icon: "🌿", labels: { en: "Plants", es: "Plantas" },
    glyphs: [
      "🌳 🌲 🌴 🌵 🌿 ☘️ 🍀 🌱 🌻 🌸 🌷 🌹 💐",
      "💮 🪷 🏵️ 🥀 🌺 🌼 🪻 🪴 🌾 🍁 🍂 🍃 🪾",
    ].join(" "),
  },
  {
    id: "science", icon: "🔬", labels: { en: "Science", es: "Ciencia" },
    glyphs: [
      "🔬 🧪 🧫 🧬 ⚗️ 🔭 📡 🧲 🥼 🦠 🧠",
      "🧑‍🔬 👨‍🔬 👩‍🔬 ⚛️ 🧮 📐 📏",
      "🪐 🌌 ☄️ 🌍 🌎 🌏",
    ].join(" "),
  },
];

const canonical = (glyph: string) => glyph.replace(/[\uFE0E\uFE0F]/g, "");
const emojiByGlyph = new Map(catalog.map(emoji => [canonical(emoji.glyph), emoji]));
const collections = new Map(subjects.map(subject => [
  subject.id,
  subject.glyphs.split(" ").map(glyph => emojiByGlyph.get(canonical(glyph))).filter((emoji): emoji is EmojiRecord => !!emoji),
]));

export function emojisForSubject(id: string): EmojiRecord[] {
  return collections.get(id) ?? [];
}
