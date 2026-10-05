import localFont from "next/font/local";

// Latin subsets include the accents used by both interface languages.
export const storyHeading = localFont({
  src: "./fonts/cormorant-garamond-latin.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  variable: "--pg-story-heading-font",
  preload: false,
  fallback: ["Georgia"],
  adjustFontFallback: "Times New Roman",
});

export const storyBody = localFont({
  src: "./fonts/eb-garamond-latin.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--pg-story-body-font",
  preload: false,
  fallback: ["Georgia"],
  adjustFontFallback: "Times New Roman",
});
