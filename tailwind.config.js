/** @type {import('tailwindcss').Config} */
// tailwind.config.js
module.exports = {
  content: [
    "./public/**/*.html",
    "./src/**/*.js", // ← add JS that builds the DOM
    "./src/**/*.html", // ← template files loaded with ?raw
  ],
  safelist: ["chat-bubble", "chat-bubble-user", "chat-bubble-bot"],
  theme: { extend: {} },
  plugins: [],
};
