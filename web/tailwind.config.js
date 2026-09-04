/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        noir:    "#0A0A0A",
        carbon:  "#1A1A1A",
        gold:    "#D4A574",
        mint:    "#00E5A0",
        glass:   "#2A2A2A",
        muted:   "#A3A3A3",
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        body:    ['"Inter"', "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
