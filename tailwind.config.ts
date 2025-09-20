import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#22d3ee",
          foreground: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
