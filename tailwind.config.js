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
        // ── LOS DOS DE LA LIMPIEZA V26 ────────────────────────────────────
        //
        // El diseño pide la presentación del enviado en 15 y el importe del
        // panel en 22. Los otros dos que pide —12 para el rótulo "Enviado" y 18
        // para el número adentro del campo— NO están acá a propósito: son
        // `text-xs` y `text-lg` de Tailwind, que este proyecto no redefine, y
        // agregarlos sería un segundo nombre para un tamaño que ya tiene uno.
        //
        // Mismo motivo que `md2` y `lg2`: van al config y no como `text-[15px]`
        // en el componente, que es lo que el trinquete prohíbe.
        base2: "15px",
        xl2: "22px",
        // ── LOS TRES DEL REDISEÑO DE TRANSFERENCIAS (V28/V28b/V29) ─────────
        //
        // 13 para los chips y los botones chicos, 19 para el importe de cada
        // bloque de local, 28 para el importe grande de la cuenta del local.
        //
        // ── Y POR QUÉ ESTOS TRES SÍ Y LOS ESPACIADOS NO ───────────────────
        //
        // La especificación de esas tres pantallas vino dibujada sobre la grilla
        // de 16 px que Figma trae por defecto, y este proyecto corre sobre
        // `1rem = 14px` —medido, no deducido: la sonda de cascada lo informa en
        // cada despliegue—. Así que sus padding y radios —16, 13, 12, 9, 6, 4;
        // radios 8, 9, 11— no caen en la escala.
        //
        // Esos se AJUSTARON a la escala del proyecto y no entraron acá, a
        // propósito: se corren como mucho 1,25 px, no se ven, y meterlos habría
        // dado trece entradas nuevas y una pantalla con su propio ritmo al lado
        // de todas las demás.
        //
        // Los tamaños de letra son el caso contrario y por eso sí entran: son los
        // números protagonistas. El importe de bloque en 19 contra el `lg2` de 17,
        // y el de la cuenta en 28 contra el `xl2` de 22 — seis píxeles en el
        // número más grande de la pantalla, que sí se ven.
        //
        // El sufijo `3` marca el segundo escalón propio de esa familia, siguiendo
        // la convención del `2`. Y como siempre: si entran acá, entran el mismo
        // día a `ESCALA` en `lib/sunmi/claseNegociada.js`, o el kit no los
        // reconoce como tamaño y la pieza vuelve a poner el suyo.
        sm3: "13px",
        lg3: "19px",
        xl3: "28px",
      },

      boxShadow: {
        soft: "0px 1px 3px rgba(0,0,0,0.12)",
        card: "0px 1px 4px rgba(0,0,0,0.08)",
      },

      borderRadius: {
        xl2: "14px",
        // 8 px, el radio de los controles del pedido —segmentado y botones del
        // stepper—. `rounded-lg` da 7 y `rounded-xl` 10,5: ninguno es 8.
        control: "8px",
      },

      spacing: {
        4.5: "18px",

        // ── LOS TRES DE LA CUADRÍCULA DE FILTROS DEL PEDIDO ───────────────
        //
        // El diseño pide 12 de padding lateral en cada botón, 8 entre botones
        // y entre filas, y 6 entre el rótulo y su número. Ninguno cae en la
        // grilla: con `1rem = 14px` los pasos son múltiplos de 3,5 —`px-3` da
        // 10,5 y `px-3.5` da 12,25; `gap-2` da 7 y `gap-2.5` da 8,75—.
        //
        // Van con nombre semántico y no como la medida, al revés que el `4.5`
        // de arriba, porque `p-3` y `gap-2` ya existen y redefinirlos movería
        // todo el repo: es el mismo criterio que `h-fila` y `h-chip`.
        filtro: "12px",
        entreFiltros: "8px",
        dentroFiltro: "6px",

        // ── LOS DOS DEL LISTADO DE RECIBIR MERCADERÍA ─────────────────────
        //
        // 4 entre los datos apilados de la tarjeta del total, y 10 entre los
        // bloques de un renglón de pedido. Ninguno cae en la grilla: `gap-1`
        // da 3,5 y `gap-2.5` da 8,75.
        dato: "4px",
        renglon: "10px",

        // ── LOS DOS DE RECIBIR UN PEDIDO ──────────────────────────────────
        //
        // 3 arriba y abajo del chip de estado, y 16 a los costados del bloque
        // de la factura. `py-0.5` da 1,75 y `px-4` da 14: ninguno de los dos
        // cae en la grilla.
        chip: "3px",
        bloque: "16px",
      },

      // ── EL BLANCO DE TOQUE ────────────────────────────────────────────
      //
      // 44 px es el mínimo que se puede tocar con el pulgar sin fallar, y en
      // este proyecto no es un número de diseño: es un requisito, porque el
      // usuario trabaja en un Sunmi de 360 px.
      //
      // Se mide en PÍXELES y no en la escala de espaciado a propósito. La escala
      // está en `rem` y este proyecto corre con `1rem = 14px`, así que `h-11`
      // —2,75rem— da 38,5 px: se lee como 44 y no lo es. Ése es exactamente el
      // tipo de error que el CLAUDE.md describe con la casilla "de 14 × 14", que
      // en el código dice `h-4 w-4`.
      //
      // Va acá y no como `min-h-[44px]` en cada pantalla, que es lo que el
      // trinquete cuenta como medida mágica. La clave ES el nombre de la regla:
      // `min-h-toque` se lee solo.
      minHeight: {
        toque: "44px",
        // ── LA ACCIÓN PRINCIPAL DE UN MODAL: 48 px ──────────────────────
        //
        // 44 es el mínimo que se puede tocar; 48 es el que se DISTINGUE de los
        // demás. En el modal de enviar un pedido hay un botón que manda el pedido
        // y dos que solo bajan un archivo, y los tres del mismo alto se leen como
        // tres opciones equivalentes — que es justo lo que este modal venía
        // haciendo mal.
        //
        // Va acá y no como `min-h-[48px]` en la pantalla, por el mismo motivo que
        // `toque`: la escala está en `rem` con `1rem = 14px`, así que `h-12`
        // —3rem— da 42 y se lee como 48 sin serlo. Y escrito a mano el trinquete
        // lo cuenta como medida mágica, con razón.
        principal: "48px",

        // ── EL ALTO DE LA TARJETA DE PRODUCTO DEL PEDIDO ──────────────────
        //
        // El diseño la pide de 101 px. Va como MÍNIMO y no como alto fijo a
        // propósito: el mismo diseño dice que el nombre puede ocupar DOS
        // renglones y que no se trunque, y con `h-` el segundo renglón quedaría
        // recortado. Con una línea la tarjeta mide los 101 pedidos; con dos,
        // crece lo que haga falta.
        tarjetaPedido: "101px",

        // ── EL ALTO DEL BUSCADOR CON VOZ ──────────────────────────────────
        //
        // El diseño pide 52. `SunmiCampoBusquedaVoz` trae `min-h-12` adentro,
        // que con `1rem = 14px` son 42 —medido a 360 en producción: el campo
        // sale 310 × 42—. 52 no cae en la grilla: `min-h-14` da 49 y
        // `min-h-15` da 52,5.
        //
        // Va como MÍNIMO porque eso es lo que la pieza declara, y una utilidad
        // de `extend` se emite después de la escala del núcleo, así que le
        // gana a `min-h-12` sin tener que forzar nada con `!`.
        campoBusqueda: "52px",

        // ── LOS CINCO DEL LISTADO DE RECIBIR MERCADERÍA ───────────────────
        //
        // Ninguno cae en la grilla de 3,5: 127, 87, 48, 64 y 40 quedan entre
        // dos pasos. Van como MÍNIMO y no como alto fijo porque todos llevan
        // texto que puede ir a dos renglones —un nombre de proveedor largo, un
        // rótulo de período— y con `h-` el segundo quedaría cortado.
        //
        // Acá vivía `diaCabecera: 63px`, el alto del encabezado del día. Se fue
        // con el rediseño de la franja: ahora el alto lo da su padding —10
        // arriba y abajo— y un mínimo encima habría sido un segundo criterio
        // para lo mismo.
        tarjetaPorEntrar: "127px",
        filaPedido: "87px",
        buscadorListado: "48px",
        entradaSinPedido: "64px",
        botonRecibir: "40px",

        // ── LOS TRES DE RECIBIR UN PEDIDO ─────────────────────────────────
        //
        // 70 la tarjeta de contexto, 236 el bloque de la factura y 48 su botón.
        // Van como MÍNIMO: el nombre de un proveedor largo parte el primer
        // renglón en dos, y con alto fijo el segundo quedaría cortado.
        contextoPedido: "70px",
        bloqueFactura: "236px",
        botonFoto: "48px",
        // La barra de "Entra al stock" en la hoja de corregir. 32 tampoco cae.
        barraStock: "32px",
      },

      // ── EL ALTO DE UNA FILA DE LISTA ──────────────────────────────────
      //
      // 60 px, pedido por el diseño de "Elegir proveedor". Va acá por el mismo
      // motivo que `toque` y no como `h-[60px]` en la pantalla, que es lo que
      // el trinquete cuenta como medida mágica.
      //
      // Y no se puede escribir con la escala: este proyecto corre con
      // `1rem = 14px`, así que los pasos son múltiplos de 3,5 —`h-16` da 56 y
      // `h-17` no existe—. 60 no cae en la grilla, y aproximarlo a 56 sería
      // justamente lo que el diseño pidió no hacer.
      //
      // Nombre semántico y no la medida, al revés que `4.5`, porque `h-60` ya
      // existe en Tailwind —15rem— y redefinirlo le cambiaría el alto a todo el
      // repo: es el mismo error que este archivo ya documenta para `border-2`.
      height: {
        fila: "60px",

        // ── LOS CONTROLES DEL PEDIDO ──────────────────────────────────────
        //
        // 32 el segmentado de tipo de pedido y 30 el chip de filtro, pedidos
        // por el diseño de la pantalla de productos del pedido. Ninguno cae en
        // la grilla: con `1rem = 14px` los pasos son múltiplos de 3,5.
        //
        // Van por DEBAJO de los 36 px que declara `.sunmi-btn-base`, y eso se
        // puede: el botón cede el eje del alto cuando la pantalla declara un
        // `min-h-*` —ver `declaraAltoMinimo` en `lib/sunmi/claseNegociada.js`—,
        // así que se usan junto a `min-h-0` y la pieza no se toca.
        segmento: "32px",
        chip: "30px",
      },

      minWidth: {
        toque: "44px",
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

      // ── EL ANCHO DE LOS CAMPOS DEL PANEL DE RECEPCIÓN ─────────────────
      //
      // El V24 los baja de la mitad cada uno a 124 px sobre 390, que es el 35 %
      // del contenedor, con un hueco vacío en el medio a propósito.
      //
      // Va como porcentaje y no como `124px`: en un teléfono de 360 el fijo
      // ocuparía 34,4 % y en uno de 412 el 30 %, y el rótulo "PACK x12
      // completos" entra JUSTO — el diseño lo dice—. Con el porcentaje la
      // relación se mantiene.
      //
      // `w-1/3` da 33,3 % y estaría a 5 px, que sobre un rótulo que entra justo
      // es la diferencia entre que entre y que no. Por eso el valor exacto.
      // ── UN SOLO BLOQUE `width`, Y ACÁ ESTÁ EL PORQUÉ ──────────────────
      //
      // Había DOS `width:` en este mismo objeto: uno con `cajaCantidad` arriba y
      // este con `35p`. En JavaScript la segunda clave gana, así que
      // `w-cajaCantidad` NO EXISTÍA en el CSS generado y el cuadro del número
      // del stepper tomaba el ancho que le tocara. No fallaba en ningún lado: el
      // build compila, los candados pasan, y la clase simplemente no matchea —
      // la misma familia que el `sunmi-btn-accent` que dejaba botones invisibles.
      //
      // Se juntan en uno. Si hace falta agregar un ancho, va ACÁ ADENTRO.
      width: {
        "35p": "35%",

        // El cuadro del número del stepper. 62 tampoco cae en la grilla.
        cajaCantidad: "62px",

        // ── LOS DOS DEL STEPPER DE LA HOJA DE CORREGIR ────────────────────
        //
        // 62 el rótulo de cada fila y 48 los botones de más y menos. El rótulo
        // tiene que ser FIJO: si se reparte, "Bultos" y "Sueltas" dejan de
        // arrancar a la misma altura y los dos steppers dejan de leerse como un
        // par.
        //
        // Acá vivían también `rotuloComparacion` y `botonCorregir`, del diseño
        // propio que tenía la tarjeta de una línea de factura. Se fueron con
        // él: esa tarjeta ahora COPIA la de la recepción de una transferencia y
        // su geometría sale de `SunmiCard` y de las clases de esa pieza, no de
        // números escritos acá. Un token que nadie usa es una medida esperando
        // a que alguien la vuelva a inventar distinta.
        rotuloStepper: "62px",
        cajaStepper: "48px",
      },
    },
  },
  plugins: [],
};
