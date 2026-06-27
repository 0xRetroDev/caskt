/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral base: deep desaturated slate, not pure black.
        ink: {
          900: "#0c0f14",
          800: "#11151c",
          700: "#161b24",
          600: "#1d2430",
          500: "#2a3340",
          400: "#3a4554",
        },
        line: "#222b38",
        fg: {
          DEFAULT: "#e6eaf0",
          dim: "#9aa6b6",
          faint: "#5f6b7c",
        },
        // Brand accent: Caskt gold/amber. Warm and premium against the near-black.
        accent: {
          DEFAULT: "#e8a82e",
          dim: "#7c5e22",
        },
        // CS2 rarity colors. These carry meaning, so they are the brand.
        rarity: {
          consumer: "#b0c3d9",
          industrial: "#5e98d9",
          milspec: "#4b69ff",
          restricted: "#8847ff",
          classified: "#d32ce6",
          covert: "#eb4b4b",
          rare: "#ade55c", // gloves/special
          gold: "#e4ae39", // knives / contraband
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        brand: ['"Saira Condensed"', '"Oswald"', '"Arial Narrow"', "Impact", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
