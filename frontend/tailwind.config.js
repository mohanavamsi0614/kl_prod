/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        productivity: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // dark: {
        //   bg: '#0f172a',
        //   surface: '#1e293b',
        //   border: '#334155',
        // },
        dark: {
          bg: '#020617',      // near-black (slate-950)
          surface: '#030712', // subtle elevation
          border: '#0f172a',  // very soft separation
      }
      }
    },
  },
  plugins: [],
}
