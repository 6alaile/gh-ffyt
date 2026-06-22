/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        fg: "#f5f5f0",
        accent: "#ffd700",
        accentDim: "#b8980a",
        rule: "#2a2a2a",
        muted: "#888888",
        danger: "#e63946",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};