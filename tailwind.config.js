/** @type {import('tailwindcss').Config} */
module.exports = {
  // Sınıflar index.html ve js/ içindeki metinlerden (JS ile üretilenler dahil) taranır
  content: ['./index.html', './js/**/*.js'],
  // Uygulamadaki tema butonu <html class="dark"> ekler/kaldırır
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
