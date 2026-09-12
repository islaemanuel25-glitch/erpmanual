/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
    "./context/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        azul: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",   // azul ERP
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        gris: {
          50: "#f5f5f5",
          100: "#e5e7eb",
          200: "#d1d5db",
          300: "#9ca3af",
          400: "#6b7280",
          500: "#4b5563",
          600: "#374151",
          700: "#1f2937",
        },
      },

      fontSize: {
        xs2: "10px",
        sm2: "11px",
        base: "14px",
        // ── LOS DOS DEL REDISEÑO V16 DE LA RECEPCIÓN ──────────────────────
        //
        // El diseño pide el nombre de la tarjeta en 16 y el importe de línea en
        // 17. Ninguno de los dos cae en la escala: este proyecto redefine `base`
        // a 14, así que el salto va de 14 a `text-lg` (18).
        //
        // Van ACÁ y no en la pantalla como `text-[16px]`. Un valor fuera de la
        // escala escrito en un componente es lo que el candado de cero hardcodeo
        // prohíbe, y con razón: el día que el diseño mueva ese tamaño habría que
        // buscarlo archivo por archivo. Siguen la convención que ya usan `xs2` y
        // `sm2` — el sufijo `2` marca los tamaños propios del proyecto.
        md2: "16px",
        lg2: "17px",
      },

      boxShadow: {
        soft: "0px 1px 3px rgba(0,0,0,0.12)",
        card: "0px 1px 4px rgba(0,0,0,0.08)",
      },

      borderRadius: {
        xl2: "14px",
      },

      spacing: {
        4.5: "18px",
      },

      // ── EL BORDE DE LA LÍNEA CORREGIDA ────────────────────────────────
      //
      // El diseño del V23 pide 1,5 px para el borde de una línea corregida en
      // la lista de recepción: 1 no se distingue del borde normal de la
      // tarjeta y 2 pesa como un error.
      //
      // Va ACÁ y no como `border-[1.5px]` en la pantalla, que es lo que el
      // trinquete cuenta como medida mágica —y lo atajó cuando lo escribí así—.
      // Misma convención que el `4.5` del spacing: la clave ES la medida, así
      // que la clase se lee sola —`border-1.5`—.
      //
      // Y NO se redefine `2`. Escribirlo como `borderWidth: { 2: "1.5px" }`
      // parece lo mismo y no lo es: le cambia el grosor a TODOS los `border-2`
      // del repo, que es exactamente el defecto que este archivo ya tiene
      // anotado para los defaults —un valor se define una vez, y pisarlo mueve
      // pantallas que nadie miró—.
      borderWidth: {
        1.5: "1.5px",
      },
    },
  },
  plugins: [],
};
