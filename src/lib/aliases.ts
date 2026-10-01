// These are subject/search associations, not changes to Unicode meanings.
export const aliases: Record<string, { en: string[]; es: string[]; topic?: { en: string; es: string }; association?: { en: string; es: string } }> = {
  "1F419": { en: ["octopoda"], es: ["octópodo", "octopoda"], topic: { en: "Octopus", es: "Octopoda" } },
  "2764": { en: ["love", "heart", "affection"], es: ["amor", "corazón", "afecto"], topic: { en: "Love", es: "Amor" } },
  "1F9E0": { en: ["thinking", "mind"], es: ["mente", "pensamiento"], topic: { en: "Brain", es: "Cerebro" } },
  "1F602": { en: ["laughter", "joy"], es: ["risa", "alegría"], topic: { en: "Laughter", es: "Risa" } },
  "1F622": { en: ["sadness", "crying"], es: ["tristeza", "llanto"], topic: { en: "Sadness", es: "Tristeza" } },
  "1F634": { en: ["sleep", "dream"], es: ["sueño", "dormir"], topic: { en: "Sleep", es: "Sueño" } },
  "2728": { en: ["magic", "sparkles"], es: ["magia", "destellos"], topic: { en: "Magic (supernatural)", es: "Magia" } },
  "1F3B5": { en: ["music", "melody"], es: ["música", "melodía"], topic: { en: "Musical note", es: "Nota musical" } },
  "1F30A": { en: ["ocean", "sea", "surf"], es: ["océano", "mar", "olas"], topic: { en: "Ocean", es: "Océano" } },
  "1F319": { en: ["moon", "night", "crescent"], es: ["luna", "noche", "creciente"], topic: { en: "Crescent", es: "Fase lunar" } },
  "1FA90": { en: ["planetary ring", "saturn", "space"], es: ["anillo planetario", "saturno", "espacio"], topic: { en: "Planetary ring", es: "Anillo planetario" } },
  "1F5FC": { en: ["tokyo", "paris", "eiffel tower"], es: ["tokio", "parís", "torre eiffel"], topic: { en: "Tokyo Tower", es: "Torre de Tokio" }, association: { en: "Paris is a related search association; this emoji depicts Tokyo Tower.", es: "París es una asociación de búsqueda; este emoji representa la Torre de Tokio." } },
  "1F5FD": { en: ["new york", "liberty"], es: ["nueva york", "libertad"], topic: { en: "Statue of Liberty", es: "Estatua de la Libertad" } },
  "1F3DB": { en: ["athens", "temple", "architecture"], es: ["atenas", "templo", "arquitectura"], topic: { en: "Classical architecture", es: "Arquitectura clásica" } },
  "1F3C3": { en: ["running", "exercise"], es: ["correr", "ejercicio"], topic: { en: "Running", es: "Carrera a pie" } },
  "1F3A8": { en: ["painting", "art"], es: ["pintura", "arte"], topic: { en: "Painting", es: "Pintura" } },
  "1F52D": { en: ["astronomy", "space"], es: ["astronomía", "espacio"], topic: { en: "Telescope", es: "Telescopio" } },
};

// Known homonyms / incorrect subject tags found during the real-source review.
// Filtering these does not add or replace any live media.
export const artExclusionsByQuery: Record<string,string[]> = {
  "fox": ["Houses on the Fox River, Illinois"],
  "statue of liberty": ["Papal Medal of Alexander VII"],
};
