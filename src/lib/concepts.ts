import type { EmojiRecord, Locale } from "./types";

// Editorial starting points, not universal definitions of symbols. Users can
// always change these interpretations. Keep Unicode labels unchanged.
const groups: [string, string, string][] = [
  ["😀 😃 😄 😁 😆 😊 🙂 ☺️", "Smile", "Sonrisa"],
  ["😂 🤣", "Laughter", "Risa"], ["🥰 😍 😘 😗 😙 😚 💕 💞 💓 💗 💖 💘 💝 🫶", "Love", "Amor"],
  ["🤔 🧐", "Thought", "Pensamiento"], ["😢 😭 😞 😔 ☹️ 🙁", "Sadness", "Tristeza"],
  ["😠 😡 🤬", "Anger", "Ira"], ["😨 😰 😱", "Fear", "Miedo"],
  ["😲 😮 😯 🤯", "Surprise (emotion)", "Sorpresa"], ["😴 🥱", "Sleep", "Sueño"],
  ["😟 😥 😓 😬", "Anxiety", "Ansiedad"], ["🤢 🤮", "Nausea", "Náusea"],
  ["😷 🤒 🤕", "Illness", "Enfermedad"], ["🥳", "Celebration", "Celebración"],
  ["😎", "Sunglasses", "Gafas de sol"], ["🤓", "Nerd", "Nerd"],
  ["😇", "Angel", "Ángel"], ["😉", "Wink", "Guiño"], ["🤗", "Hug", "Abrazo"],
  ["😌", "Relief (emotion)", "Alivio"], ["😳 🫣", "Embarrassment", "Vergüenza"],
  ["🤫", "Silence", "Silencio"], ["🤥", "Lie", "Mentira"], ["🤤", "Drooling", "Sialorrea"],
  ["😐 😑 😶 🫥", "Facial expression", "Expresión facial"], ["😏", "Smirk", "Sonrisa afectada"],
  ["🙄", "Eye-rolling", "Giro de ojos"], ["😒", "Boredom", "Aburrimiento"],
  ["🤩", "Awe", "Asombro"], ["🥺", "Emotion", "Emoción"],
  ["😛 😜 😝 🤪", "Play (activity)", "Juego"], ["🫠", "Melting", "Fusión (cambio de estado)"],
  ["🥶", "Cold", "Frío"], ["🥵", "Heat", "Calor"], ["🤧", "Sneeze", "Estornudo"],
  ["💔", "Heartbreak", "Despecho"], ["🖤 🤍 🤎 💜 💙 💚 💛 🧡 🩷 🩵 🩶", "Heart symbol", "Corazón (símbolo)"],
  ["👍 👎", "Thumb signal", "Pulgar arriba"], ["👋", "Waving", "Saludo"],
  ["🙏", "Prayer", "Oración (religión)"], ["👏", "Applause", "Aplauso"], ["🤝", "Handshake", "Apretón de manos"],
  ["💪", "Muscle", "Músculo"], ["🧘", "Meditation", "Meditación"], ["🏊", "Swimming", "Natación"],
  ["🚴", "Cycling", "Ciclismo"], ["🤸", "Gymnastics", "Gimnasia"], ["💃 🕺", "Dance", "Danza"],
  ["💡", "Incandescent light bulb", "Lámpara incandescente"], ["☕", "Coffee", "Café"],
  ["📚 📖", "Book", "Libro"], ["💌", "Love letter", "Carta de amor"],
  ["🎭", "Performing arts", "Artes escénicas"], ["🎹", "Musical keyboard", "Teclado (instrumento musical)"],
  ["⚽", "Association football", "Fútbol"], ["🎪", "Circus", "Circo"],
  ["🏝️", "Desert island", "Isla desierta"], ["🌌", "Milky Way", "Vía Láctea"],
  ["🌸", "Cherry blossom", "Sakura (cerezo)"], ["🍰", "Cake", "Pastel"],
  ["🧋", "Bubble tea", "Té de burbujas"], ["☮️", "Peace", "Paz"], ["♾️", "Infinity", "Infinito"],
  ["🔥", "Fire", "Fuego"], ["🌍 🌎 🌏", "Earth", "Tierra"], ["🧸", "Teddy bear", "Oso de peluche"],
  ["🕯️", "Candle", "Vela (iluminación)"], ["🧭", "Compass", "Brújula"],
];
const animals: [string,string,string][] = [
  ["🐵 🐒", "Monkey", "Mono"], ["🐶 🐕", "Dog", "Perro"], ["🐱 🐈", "Cat", "Gato"],
  ["🐯 🐅", "Tiger", "Tigre"], ["🦁", "Lion", "León"], ["🐮 🐄", "Cattle", "Bos taurus"],
  ["🐷 🐖", "Pig", "Cerdo"], ["🐭 🐁", "Mouse", "Ratón"], ["🐹", "Hamster", "Hámster"],
  ["🐰 🐇", "Rabbit", "Conejo"], ["🐻", "Bear", "Oso"], ["🐼", "Giant panda", "Panda gigante"],
  ["🦊", "Fox", "Zorro"], ["🐸", "Frog", "Rana"], ["🐳 🐋", "Whale", "Ballena"],
  ["🐴 🐎", "Horse", "Caballo"], ["🐺", "Wolf", "Lobo"],
  ["🏃", "Running", "Carrera a pie"], ["🚶", "Walking", "Caminar"],
];
groups.push(...animals);
const key = (glyph: string) => glyph.replace(/\uFE0F/g, "");
const topics = new Map(groups.flatMap(([glyphs,en,es]) => glyphs.split(" ").map(glyph => [key(glyph),{en,es}] as const)));
export function conceptFor(emoji: EmojiRecord): Record<Locale,string> | undefined {
  const glyph = key(emoji.glyph);
  // Gender variants of the same activity share a subject.
  return topics.get(glyph) || topics.get(glyph.replace(/\u200D[♀♂]$/, ""));
}
