/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050505",
        "bg-elevated": "#0d0d0d",
        "bg-hover": "#141414",
        fg: "#fafafa",
        "fg-muted": "#a3a3a3",
        accent: "#FFD700",
        "accent-hover": "#E6C200",
        "accent-soft": "#1a1500",
        "accent-glow": "rgba(255, 215, 0, 0.15)",
        rule: "#1f1f1f",
        danger: "#ef4444",
        success: "#22c55e",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "card": "0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,215,0,0.05)",
        "card-hover": "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,215,0,0.1)",
        "glow": "0 0 24px rgba(255,215,0,0.15)",
        "drawer": "0 -4px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,215,0,0.08)",
      },
      transitionDuration: {
        "fast": "150ms",
        "normal": "300ms",
        "slow": "500ms",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};