// lib/proveedores/listas/candidatosSinCodigo.js
//
// CANDIDATOS PARA UN PRODUCTO SIN CÓDIGO GUARDADO.
//
// El producto existe en el sistema, la lista puede haberlo traído, y no hubo
// forma de reconocerlo porque no sabemos con qué código lo llama el proveedor.
// Las tarjetas del panel son entonces FILAS DEL ARCHIVO: las 625 que no
// machearon con nada, que dejan de ser un problema de la cola y pasan a ser la
// fuente de candidatos.
//
// ── DOS SEÑALES, NO UNA ─────────────────────────────────────────────────────
//
// El parecido de nombre solo no alcanza y ya sabemos por qué: el motor se niega
// a machear por nombre justamente porque genera falsos positivos que nadie
// revisa. Acá se le suma la segunda señal, que es la que el nombre no puede dar:
// si el costo que saldría de esa fila cae dentro del aumento esperado.
//
// Las dos juntas se leen así:
//
//   nombre alto + precio coherente  → SE SUGIERE. Las dos señales apuntan igual.
//   nombre alto + precio absurdo    → se muestra SIN sugerir. Puede ser el
//                                     producto y estar mal la presentación, o
//                                     puede ser otro producto con nombre
//                                     parecido. Hay que mirarlo.
//   nombre flojo + precio coherente → se muestra SIN sugerir. El precio cierra,
//                                     pero que cierre no identifica: muchos
//                                     productos distintos comparten rango.
//   ninguna de las dos              → NO APARECE. Sin ninguna señal, mostrarlo
//                                     sería llenar el panel de ruido.
//
// Sugerir NO es vincular. Igual que en el resto del módulo, la sugerencia es una
// pista para que una persona mire; el vínculo lo crea ella.
//
// ── DE DÓNDE SALE CADA SEÑAL ────────────────────────────────────────────────
//
// El parecido, de `parecidoNombre`, el mismo del motor. El costo, de
// `analizarFila`, el mismo que arma las tarjetas de interpretación — así una
// fila con dos lecturas posibles se juzga por la mejor de las dos y no por una
// cuenta escrita acá. Ninguna de las dos señales se reimplementa.
//
// Módulo puro: sin BD, sin Next.

import { parecidoNombre, MIN_PARECIDO_NOMBRE } from "./conciliarLista.js";
import { analizarFila } from "./confirmarPresentacion.js";
import { ESTADO_VARIACION } from "./rangoAumento.js";

/** Cuántos candidatos se muestran. Más que esto es una lista para revisar, no para elegir. */
export const MAX_CANDIDATOS = 5;

/**
 * Umbral del parecido para considerar el nombre una señal.
 *
 * Es el mismo del motor, a propósito: si acá se aflojara, la pantalla sugeriría
 * vínculos que el motor no se anima a proponer, con el agravante de que estos
 * SÍ se pueden confirmar de un clic.
 */
export const MIN_PARECIDO = MIN_PARECIDO_NOMBRE;

/** Las dos señales de un candidato, y qué se hace con ellas. */
export const SENIAL = {
  NOMBRE: "NOMBRE",
  PRECIO: "PRECIO",
};

/**
 * ¿El costo que saldría de esta fila es coherente con lo que se espera?
 *
 * Coherente = alguna de las interpretaciones posibles cae DENTRO del rango de
 * aumento esperado. Se pregunta por la mejor de las lecturas y no por una sola:
 * una fila que cotiza por unidad puede dar un costo absurdo leída de una forma y
 * el esperado leída de la otra, y descartarla por la primera sería perder el
 * candidato correcto.
 */
export function precioCoherente(analisis) {
  const evaluadas = analisis?.evaluadas ?? [];
  return evaluadas.some((h) => h.estado === ESTADO_VARIACION.ESPERADO);
}

/**
 * Los candidatos de un producto sin código, ya evaluados y ordenados.
 *
 * @param producto  { nombre, precio_costo, unidad_medida, factor_pack, modoCompraProveedor }
 * @param filas     filas del archivo SIN producto vinculado
 * @param recargoPct recargo de la importación
 * @param rango     { minPct, maxPct } el que corresponde, ya resuelto
 *
 * @returns [{ filaId, filaExcel, codigo, descripcion, parecido, nombreAlto,
 *             precioCoherente, costoNuevo, variacionPct, estadoVariacion,
 *             sugerido, senales[] }]
 */
export function candidatosParaProducto({ producto, filas = [], recargoPct, rango } = {}) {
  if (!producto?.nombre) return [];

  const evaluados = [];
  for (const fila of filas) {
    const parecido = parecidoNombre(producto.nombre, fila?.descripcionProveedor);
    const nombreAlto = parecido >= MIN_PARECIDO;

    const analisis = analizarFila({ fila, base: producto, recargoPct, rango });
    const coherente = precioCoherente(analisis);

    // Sin ninguna de las dos señales no entra. Es la regla que mantiene el panel
    // corto: de 625 filas, la mayoría no se parece en nada a este producto.
    if (!nombreAlto && !coherente) continue;

    // La lectura que se muestra es la que mejor explica el candidato: la que cae
    // en el rango si hay alguna, y si no la primera. Mostrar la absurda cuando
    // existe una razonable haría descartar de vista un candidato bueno.
    const elegida =
      (analisis.evaluadas ?? []).find((h) => h.estado === ESTADO_VARIACION.ESPERADO) ??
      (analisis.evaluadas ?? [])[0] ??
      null;

    const senales = [];
    if (nombreAlto) senales.push(SENIAL.NOMBRE);
    if (coherente) senales.push(SENIAL.PRECIO);

    evaluados.push({
      filaId: fila?.id ?? null,
      filaExcel: fila?.filaExcel ?? null,
      codigo: fila?.codigoCrudo ?? fila?.codigoNormalizado ?? null,
      descripcion: fila?.descripcionProveedor ?? "",
      parecido: Number(parecido.toFixed(3)),
      nombreAlto,
      precioCoherente: coherente,
      costoNuevo: elegida?.costoNuevo ?? null,
      variacionPct: elegida?.variacionPct ?? null,
      estadoVariacion: elegida?.estado ?? null,
      multiplicador: elegida?.multiplicador ?? null,
      // Las DOS señales. Una sola muestra pero no propone.
      sugerido: nombreAlto && coherente,
      senales,
    });
  }

  // Primero los sugeridos, después por parecido. Dentro del mismo parecido, el
  // que además tiene el precio coherente.
  evaluados.sort((a, b) => {
    if (a.sugerido !== b.sugerido) return a.sugerido ? -1 : 1;
    if (b.parecido !== a.parecido) return b.parecido - a.parecido;
    return Number(b.precioCoherente) - Number(a.precioCoherente);
  });

  return evaluados.slice(0, MAX_CANDIDATOS);
}

/**
 * ¿Hay UNA sugerencia clara?
 *
 * Solo cuando hay exactamente un candidato con las dos señales. Dos sugeridos no
 * sugieren ninguno: es el mismo criterio que usa el motor para el empate técnico
 * en `sugerirPorNombre`, y por la misma razón — elegir uno sería adivinar a qué
 * producto se le va a escribir el costo.
 */
export function sugerenciaUnica(candidatos = []) {
  const sugeridos = candidatos.filter((c) => c.sugerido);
  return sugeridos.length === 1 ? sugeridos[0] : null;
}
