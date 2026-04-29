/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
  ],
  theme: {
    fontFamily: {
      sans:    ['"Instrument Sans"', 'sans-serif'],
      display: ['Syne', 'sans-serif'],
      mono:    ['"JetBrains Mono"', 'monospace'],
    },
  },
}
