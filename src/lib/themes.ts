export const themes = ["classic", "cyberpunk", "solarpunk", "retro"] as const;
export type Theme = typeof themes[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && themes.includes(value as Theme);
}

export const themeLabels = {
  en: { label: "Themes", classic: "Classic", cyberpunk: "Cyberpunk", solarpunk: "Solarpunk", retro: "Retro" },
  es: { label: "Temas", classic: "Clasico", cyberpunk: "Cyberpunk", solarpunk: "Solarpunk", retro: "Retro" },
};

// Apply the validated preference before the first paint. Reading storage must
// never prevent the app opening, including when storage is unavailable.
export function themeInitializationScript(storageKey: string) {
  return `try{const p=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})||"{}");document.documentElement.dataset.theme=${JSON.stringify(themes)}.includes(p?.theme)?p.theme:"classic";}catch{document.documentElement.dataset.theme="classic";}`;
}
