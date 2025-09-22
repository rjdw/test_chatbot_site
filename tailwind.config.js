/** @type {import('tailwindcss').Config} */
// tailwind.config.js
export default {
  content: [
    "./public/**/*.html",
    "./src/**/*.js", // ← add JS that builds the DOM
    "./src/**/*.html", // ← template files loaded with ?raw
  ],
  safelist: [
    "chat-bubble",
    "chat-bubble-user", 
    "chat-bubble-bot",
    "first-line:indent-8",
    "prose",
    "prose-gray",
    "prose-lg",
    "max-w-none",
  ],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
};
