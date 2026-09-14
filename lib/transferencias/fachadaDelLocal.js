// lib/transferencias/fachadaDelLocal.js
//
// LA FACHADA DE CADA LOCAL: su paleta y la geometría del dibujo.
//
// ── POR QUÉ ESTE ARCHIVO ESTÁ EN `lib/` Y NO AL LADO DEL COMPONENTE ──────
//
// Porque estos colores NO son interfaz: son un DIBUJO. Es la diferencia entre
// "el borde de una tarjeta" —que tiene que seguir el tema, y por eso sale de un
// token— y "el verde de un toldo", que es como el color de una foto: no cambia
// porque el usuario pase a tema oscuro, igual que no cambia la camiseta de una
// persona en una fotografía.
//
// Y hay una consecuencia práctica que era parte del pedido. El trinquete
// (`scripts/hardcodeo.mjs`) enumera con `git ls-files app/**/*.jsx
// components/**/*.jsx`, y el chequeo de tokens mira `app/modulos` y
// `components/caja`. **`lib/` no entra en ninguno de los dos.** Así que los
// cuarenta y pico de hexadecimales de acá abajo no se cuentan como hardcodeo de
// interfaz — y no porque se los haya escondido, sino porque están en el único
// lugar donde son lo que dicen ser: datos.
//
// El componente que los dibuja (`FachadaDelLocal.jsx`) no escribe **ni un solo
// color**: recibe la paleta y la pinta. Si alguien mañana mete un hex ahí, el
// trinquete lo va a contar, que es lo correcto.
//
// La franja de la tarjeta es otra cosa y sí sale del tema: es interfaz.

/**
 * Las cuatro paletas. Una por local, para distinguirlos de un vistazo.
 *
 * `frutas` son cinco porque el cajón lleva cinco, y van en orden: cambiar el
 * orden cambia el dibujo, así que es una lista y no un conjunto.
 */
export const PALETAS = Object.freeze({
  verde: Object.freeze({
    nombre: "verde",
    muro: "#f1f5f9",
    zocalo: "#94a3b8",
    cartel: "#0f766e",
    textoCartel: "#ffffff",
    toldoA: "#10b981",
    toldoB: "#ecfdf5",
    vidrio: "#7dd3fc",
    marco: "#334155",
    puerta: "#0f766e",
    cajon: "#b45309",
    frutas: Object.freeze(["#ef4444", "#f59e0b", "#84cc16", "#f97316", "#ec4899"]),
  }),
  rojo: Object.freeze({
    nombre: "rojo",
    muro: "#fef2f2",
    zocalo: "#9f1239",
    cartel: "#9f1239",
    textoCartel: "#ffffff",
    toldoA: "#e11d48",
    toldoB: "#fff1f2",
    vidrio: "#93c5fd",
    marco: "#334155",
    puerta: "#7f1d1d",
    cajon: "#78350f",
    frutas: Object.freeze(["#22c55e", "#eab308", "#ef4444", "#a855f7", "#06b6d4"]),
  }),
  azul: Object.freeze({
    nombre: "azul",
    muro: "#eff6ff",
    zocalo: "#1e3a8a",
    cartel: "#1d4ed8",
    textoCartel: "#ffffff",
    toldoA: "#3b82f6",
    toldoB: "#eff6ff",
    vidrio: "#a5f3fc",
    marco: "#1e293b",
    puerta: "#1e3a8a",
    cajon: "#92400e",
    frutas: Object.freeze(["#f97316", "#84cc16", "#ef4444", "#eab308", "#8b5cf6"]),
  }),
  ambar: Object.freeze({
    nombre: "ambar",
    muro: "#fefce8",
    zocalo: "#854d0e",
    cartel: "#a16207",
    textoCartel: "#ffffff",
    toldoA: "#eab308",
    toldoB: "#fefce8",
    vidrio: "#bae6fd",
    marco: "#3f3f46",
    puerta: "#854d0e",
    cajon: "#7c2d12",
    frutas: Object.freeze(["#ef4444", "#22c55e", "#f97316", "#a855f7", "#14b8a6"]),
  }),
});

/** El orden importa: el índice sale del nombre y tiene que ser estable. */
export const ORDEN_DE_PALETAS = Object.freeze(["verde", "rojo", "azul", "ambar"]);

/**
 * Lo que NO cambia entre paletas: la vereda, las dos sombras y los reflejos del
 * vidrio.
 *
 * Están acá y no sueltos en el componente porque son exactamente lo mismo que
 * los otros —color de un dibujo— y porque la primera versión los dejó escritos
 * en el JSX: el trinquete los contó como hardcodeo de interfaz, con razón, y así
 * la afirmación "este componente no escribe un solo color" pasó de ser un
 * comentario a ser verdad. Hay un candado que la sostiene.
 */
export const NEUTROS_DE_LA_FACHADA = Object.freeze({
  vereda: "#cbd5e1",
  sombra: "#0f172a",
  reflejo: "#ffffff",
});

/**
 * Un número estable a partir del nombre del local.
 *
 * ── POR QUÉ DERIVADO Y NO CONFIGURADO ────────────────────────────────────
 *
 * Para que un local nuevo tenga su color sin que nadie elija nada, y para que el
 * mismo local tenga siempre el mismo —hoy, mañana y en otra sesión—. Una
 * configuración sería una fila más que cargar, y un color al azar haría que la
 * fachada cambiara entre dos cargas de la misma pantalla, que es peor que no
 * tener color.
 *
 * ── POR QUÉ ESTE HASH Y NO EL ID ─────────────────────────────────────────
 *
 * El id es un autoincremental: dos locales cargados seguidos caerían en paletas
 * contiguas, y en un grupo de cuatro eso es tan bueno como el nombre. Pero el id
 * NO viaja a las pruebas ni a los candados —cambia en cada siembra— y el nombre
 * sí. Con el nombre, el candado puede afirmar "mini el 7 es azul" y eso vale en
 * cualquier base.
 *
 * ── UN DJB2 PELADO NO SIRVE ACÁ, Y ES ARITMÉTICA, NO MALA SUERTE ─────────
 *
 * La primera versión era djb2 a secas —`h = h*33 + c`— y con los cuatro locales
 * de producción **los cuatro daban la misma paleta**. No fue casualidad:
 *
 *   33 ≡ 1 (mod 4)
 *
 * así que `h % 4` depende ÚNICAMENTE de la suma de los códigos de los
 * caracteres, y nombres parecidos —"mini el 7", "Mini unidas"— caen juntos. Con
 * cuatro paletas y un módulo de 4, los bits bajos de djb2 no alcanzan.
 *
 * Por eso después del djb2 va un paso de MEZCLA (el `fmix32` de MurmurHash3):
 * tres xor-shifts y dos multiplicaciones que reparten la entropía de los bits
 * altos hacia los bajos. Con eso el módulo deja de mirar una suma y pasa a mirar
 * el hash entero.
 *
 * `Math.imul` y no `*`: la multiplicación de JavaScript pasa por punto flotante
 * y pierde precisión arriba de 2^53, así que dos nombres distintos podrían
 * terminar en el mismo número por redondeo. `imul` hace la multiplicación de 32
 * bits con desborde, que es la que esta mezcla necesita.
 *
 * Lo atrapó su propio candado, que exige que los cuatro locales reales no caigan
 * todos en la misma paleta.
 *
 * No es criptográfico y no tiene que serlo: lo único que se le pide es que dé
 * siempre lo mismo para la misma entrada, y que reparta.
 *
 * Se normaliza —minúsculas y sin espacios de los bordes— para que "Mini El 7" y
 * "mini el 7 " no se dibujen distinto. Los acentos NO se sacan: son parte del
 * nombre y quitarlos haría que dos locales que se escriben distinto compartieran
 * color sin motivo.
 */
export function numeroDelNombre(nombre) {
  const texto = String(nombre ?? "").trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  // fmix32: reparte los bits altos hacia los bajos.
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * La paleta de un local, derivada de su nombre.
 *
 * Sin nombre cae en la primera, que es una decisión y no un descuido: un local
 * sin nombre es un dato roto, y dibujarlo sin fachada lo escondería en vez de
 * mostrarlo.
 */
export function paletaDelLocal(nombre) {
  const clave = ORDEN_DE_PALETAS[numeroDelNombre(nombre) % ORDEN_DE_PALETAS.length];
  return PALETAS[clave];
}

// ── LA GEOMETRÍA ──────────────────────────────────────────────────────────
//
// El dibujo vive en una caja de 120×120 y se escala con `viewBox`, así que los
// números de acá son los del diseño y no dependen del tamaño en el que se
// muestre. Están como DATOS —no como JSX— por el mismo motivo que los colores:
// para que el componente sea un bucle sobre una lista y no cuarenta líneas de
// rectángulos escritos a mano, donde un número mal tipeado no se ve.

/** Los siete paños del toldo y sus festones, con su x y su color alternado. */
export const PANOS_DEL_TOLDO = Object.freeze(
  Array.from({ length: 7 }, (_, i) => ({
    x: 14 + i * 13.15,
    par: i % 2 === 0,
  }))
);

/** Las cinco frutas del cajón. */
export const FRUTAS_DEL_CAJON = Object.freeze(
  Array.from({ length: 5 }, (_, i) => ({ x: 27 + i * 7, indice: i }))
);

/** Las tres líneas decorativas del cartel: x y ancho. */
export const LINEAS_DEL_CARTEL = Object.freeze([
  { x: 18, ancho: 20 },
  { x: 44, ancho: 32 },
  { x: 82, ancho: 20 },
]);
