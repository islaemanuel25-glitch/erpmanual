// lib/proveedores/listas/explicarLectura.js
//
// CADA FORMA DE LEER UN PRECIO, DICHA EN CRIOLLO.
//
// ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
//
// La pantalla vieja ofrecía las lecturas como botones que decían solo el número:
// "Usar $ 11.083,72". Con eso no se puede decidir nada — y es exactamente por lo
// que la importación #5 terminó con productos listos a +1.008 % sobre un rango
// de 2 a 15: alguien apretó el botón que tenía adelante.
//
// Para decidir hacen falta tres cosas, y las tres salen de acá:
//
//   · QUÉ SIGNIFICARÍA esa lectura —"es el precio de una unidad" contra "es el
//     precio de la caja entera"—, que es la pregunta real que se está
//     contestando;
//   · CUÁNTO DARÍA el costo y cuánto es eso contra el costo de hoy;
//   · DE DÓNDE SALE ESE NÚMERO, con la cuenta escrita: "Caja de 20 × $ 668,86
//     (con tu recargo del 5 %)". Sin el recargo adentro la cuenta no cierra
//     contra el precio que el papel muestra, y el usuario no puede verificarla.
//
// ── POR QUÉ EL TÍTULO NO SALE DE LA CLAVE A SECAS ───────────────────────────
//
// `MISMA_PRESENTACION` no quiere decir lo mismo para todos los productos.
// Significa "el precio del archivo ya es de la presentación que tenés cargada":
// si el producto está cargado por caja, eso es EL PRECIO DE LA CAJA ENTERA; si
// está cargado por unidad, es el precio de la unidad. El título tiene que decir
// lo que la persona ve en su catálogo, no el nombre interno del multiplicador.
//
// Módulo puro: sin BD, sin Next, sin React.

import { esAbsurda, ESTADO_VARIACION } from "./rangoAumento.js";

const money = (v) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? "—"
    : `$ ${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// UN DECIMAL SIEMPRE, hasta el 100. "+1 %" y "+1,0 %" se leen distinto cuando
// al lado hay un "+1,6 %": el primero parece redondeado a mano. De 100 para
// arriba el decimal no aporta nada y alarga el número.
const pctTexto = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const signo = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const texto = abs >= 100 ? String(Math.round(abs)) : abs.toFixed(1).replace(".", ",");
  return `${signo}${texto} %`;
};

const numeroONull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * El título de una lectura, en el vocabulario del catálogo de quien mira.
 *
 * @param multiplicador  por cuánto multiplica el precio de la lista
 * @param factorPack     cuántas unidades tiene la presentación cargada, o null
 */
export function tituloDeLectura({ multiplicador, factorPack } = {}) {
  const mult = Number(multiplicador);
  const porCaja = numeroONull(factorPack);

  if (mult > 1) return "Es el precio de UNA unidad";
  if (porCaja !== null && porCaja > 1) return "Es el precio de la CAJA entera";
  return "Es el precio de este producto, tal cual";
}

/**
 * La cuenta, escrita para que se pueda verificar contra el papel.
 *
 * El recargo entra SIEMPRE que exista, porque el número que se muestra ya lo
 * tiene adentro: sin nombrarlo, la cuenta no da y parece un error del sistema.
 */
export function cuentaDeLectura({ multiplicador, precioLista, recargoPct, factorPack } = {}) {
  const mult = Number(multiplicador);
  const precio = numeroONull(precioLista);
  const recargo = numeroONull(recargoPct);
  const conRecargo = precio === null ? null : precio * (1 + (recargo ?? 0) / 100);
  const coletilla = recargo ? ` (con tu recargo del ${String(recargo).replace(".", ",")} %)` : "";

  if (precio === null) return "";
  if (mult > 1) {
    const cuantas = numeroONull(factorPack) ?? mult;
    return `Caja de ${cuantas} × ${money(conRecargo)}${coletilla}`;
  }
  return recargo
    ? `${money(precio)} de la lista${coletilla} = ${money(conRecargo)}`
    : `${money(precio)}, tal como viene en la lista`;
}

/**
 * La advertencia, cuando la hay. Es lo que convierte un número en una decisión.
 *
 * Tres niveles y en este orden: lo imposible, lo que no cae en el rango, y nada.
 * El orden importa porque una lectura absurda TAMBIÉN está fuera de rango, y
 * decir "no cae en el rango" sobre un costo que se divide por veinte se queda
 * corto.
 */
export function advertenciaDeLectura({ variacionPct, fueraDeRango } = {}) {
  const v = numeroONull(variacionPct);
  if (v !== null && esAbsurda(v)) {
    return v < 0
      ? "Bajaría casi todo el costo: poco probable"
      : "Multiplicaría el costo varias veces: poco probable";
  }
  if (fueraDeRango) return "Queda fuera de lo que suele aumentar este proveedor";
  return null;
}

/**
 * Una lectura lista para dibujar.
 *
 * Recibe lo que ya calculó el motor —`evaluadas` de `analizarFila`— y le agrega
 * las tres cosas que hacen falta para decidir. No recalcula ningún costo: el
 * número que se muestra tiene que ser EL MISMO que se va a escribir, y por eso
 * sale de la lectura y no de una cuenta nueva acá.
 */
export function lecturaParaPantalla({
  lectura, precioLista, recargoPct, factorPack, recomendada = false,
} = {}) {
  // "Fuera de rango" es TODO lo que no es lo esperado y no es quedarse igual.
  // `SIN_AUMENTO` no lo es —no hay nada que escribir— y `SIN_REFERENCIA`
  // tampoco: sin costo cargado no se puede afirmar que algo esté afuera.
  const fueraDeRango =
    lectura?.estado === ESTADO_VARIACION.AUMENTO_ALTO ||
    lectura?.estado === ESTADO_VARIACION.AUMENTO_BAJO ||
    lectura?.estado === ESTADO_VARIACION.DISMINUCION;
  return {
    clave: lectura?.clave ?? null,
    multiplicador: Number(lectura?.multiplicador ?? 1),
    costoNuevo: numeroONull(lectura?.costoNuevo),
    variacionPct: numeroONull(lectura?.variacionPct),
    titulo: tituloDeLectura({ multiplicador: lectura?.multiplicador, factorPack }),
    cuenta: cuentaDeLectura({
      multiplicador: lectura?.multiplicador,
      precioLista,
      recargoPct,
      factorPack,
    }),
    advertencia: advertenciaDeLectura({
      variacionPct: lectura?.variacionPct,
      fueraDeRango,
    }),
    absurda: lectura?.absurda === true,
    fueraDeRango,
    recomendada,
    // Para el botón principal: "Usar $X y seguir".
    textoBoton: `Usar ${money(lectura?.costoNuevo)} y seguir`,
  };
}

export { money, pctTexto };
