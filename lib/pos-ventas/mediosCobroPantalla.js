// lib/pos-ventas/mediosCobroPantalla.js
//
// LO QUE LA PANTALLA DE COBROS MUESTRA DE CADA MEDIO, calculado acá y no en el
// JSX.
//
// ── POR QUÉ NO VA ADENTRO DE LA PANTALLA ───────────────────────────────────
//
// Son decisiones —cuándo se dice "Sin recargo" y cuándo "Recargo 5 %", cuándo se
// nombra el procesador y cuándo el tipo— y las decisiones se pueden ejercer sin
// montar React. Adentro del JSX quedarían sin candados, y son exactamente el
// tipo de cosa que después alguien escribe distinto en la segunda pantalla.
//
// Nada de acá inventa datos: todo sale de lo que devuelve `/api/medios-cobro`.
// Ningún nombre de medio, ningún porcentaje y ningún orden está escrito acá.

import { MEDIO_LABEL } from "./pagos.js";
import { PROCESADOR_LABEL } from "./mediosCobro.js";

/**
 * Vocales, con y sin acento. Se enumeran para poder preguntar por lo que NO es
 * vocal sin normalizar la cadena: una clase negada de vocales no necesita
 * caracteres combinantes en el literal, que son invisibles en el editor y
 * cualquiera los borra sin ver que estaba borrando algo.
 */
const VOCALES = "aeiouáéíóúàèìòùäëïöüâêîôû";

/**
 * LAS DOS LETRAS DEL REDONDEL.
 *
 * Salen del NOMBRE, que es lo único que la pantalla puede mostrar y que además
 * el local puede cambiar. Una tabla de nombre → sigla no serviría: los nombres
 * son configurables, así que "MP Débito" o "Posnet Norte" no estarían en ninguna
 * tabla.
 *
 * La regla, en orden:
 *   1. Dos palabras o más → la inicial de las dos primeras. "Mercado Pago" → MP.
 *   2. Una sola palabra   → su inicial y la primera consonante que le sigue.
 *      "Débito" → DB, "Crédito" → CR, "Efectivo" → EF.
 *   3. Si no hay consonante después → las dos primeras letras.
 *
 * La segunda regla existe porque las dos primeras letras de una palabra suelen
 * ser letra y vocal, y "DÉ" o "CR" no distinguen nada entre varios medios que
 * empiezan igual. La consonante es lo que hace que se lean distinto de un
 * vistazo, que es para lo único que sirve el redondel.
 */
export function inicialesDeMedio(nombre) {
  const limpio = String(nombre ?? "").trim();
  if (!limpio) return "··";

  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }

  const palabra = palabras[0];
  const resto = palabra.slice(1);
  let consonante = "";
  for (const letra of resto) {
    const esLetra = letra.toLowerCase() !== letra.toUpperCase();
    if (esLetra && !VOCALES.includes(letra.toLowerCase())) {
      consonante = letra;
      break;
    }
  }

  return (consonante ? palabra[0] + consonante : palabra.slice(0, 2)).toUpperCase();
}

/**
 * EL RENGLÓN COMERCIAL: qué se le suma al cliente y qué le cobra el procesador.
 *
 * El 0 se escribe "Sin recargo" y no "0 %" a propósito. Son la misma cuenta y no
 * se leen igual: un 0 se lee como un campo que nadie llenó, y "Sin recargo" se
 * lee como lo que es, que a ese medio no se le suma nada.
 */
export function resumenComercial(medio) {
  const recargo = Number(medio?.recargoPct) || 0;

  // "Sin comisión" y "sin configurar" son cosas distintas y antes se leían
  // igual, porque el `|| 0` las juntaba. Una es una decisión —este medio no
  // cobra comisión— y la otra es que todavía nadie la cargó.
  const sinConfigurar = medio?.comisionPct == null;
  const comision = Number(medio?.comisionPct) || 0;

  return [
    recargo > 0 ? `Recargo ${formatearPct(recargo)}` : "Sin recargo",
    sinConfigurar
      ? "Comisión sin configurar"
      : comision > 0
        ? `Comisión ${formatearPct(comision)}`
        : "Sin comisión",
  ].join(" · ");
}

/**
 * EL RENGLÓN DE CLASIFICACIÓN: dónde está el botón y por dónde pasa la plata.
 *
 * Si el medio tiene procesador se nombra el procesador, porque es el dato que no
 * se adivina: un débito puede ir por el banco o por Mercado Pago y en la caja se
 * ve igual. Sin procesador se nombra el tipo contable, que es lo que queda.
 */
export function resumenClasificacion(medio) {
  const orden = `Orden ${Number(medio?.orden) || 0}`;
  const proc = medio?.procesador ? PROCESADOR_LABEL[medio.procesador] || medio.procesador : null;
  if (proc) return `${orden} · Procesador ${proc}`;

  const tipo = MEDIO_LABEL[medio?.tipoContable] || medio?.tipoContable || "";
  return `${orden} · Tipo ${tipo.toLowerCase()}`;
}

/**
 * "Activo" u "Oculto", que es lo que la pantalla dice.
 *
 * No dice "Inactivo": lo que cambia `activo` es si el botón APARECE en la caja,
 * y "oculto" es lo que va a pasar. Un medio apagado no deja de existir ni deja de
 * tener su configuración.
 */
export function etiquetaVisibilidad(medio) {
  return medio?.activo ? "Activo" : "Oculto";
}

/**
 * Un porcentaje como lo escribe una persona: sin decimales si es redondo.
 *
 * 5 → "5 %". 3.5 → "3,5 %". El separador decimal es la coma porque el resto del
 * sistema está en es-AR.
 */
export function formatearPct(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "0 %";
  const texto = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return `${texto} %`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DEL FORMULARIO
//
// Están acá y no adentro del componente porque son las que pueden romper algo en
// silencio, y adentro del JSX no se pueden ejercer sin un navegador. Las tres:
// con qué valores arranca el formulario, qué pasa al cambiar el tipo contable, y
// qué se manda al guardar.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "SIN PROCESADOR" ES UNA ELECCIÓN; LA CADENA VACÍA ES NO HABER ELEGIDO.
 *
 * Los dos terminan mandando `null`, así que parecía que daba lo mismo usar "" para
 * las dos cosas. No da: con "" el selector de un medio nuevo mostraba "Sin
 * procesador" ya elegido en vez de pedir que se elija, y el efectivo de un local
 * —que legítimamente no tiene procesador— tiene que mostrar "Sin procesador" y no
 * "Elegir". Son dos estados y se ven distinto.
 *
 * Lo encontró un candado de render contando cuántas veces aparecía "Elegir":
 * salía una vez y tenían que ser dos.
 */
export const SIN_PROCESADOR = "SIN_PROCESADOR";

/**
 * CON QUÉ ARRANCA EL FORMULARIO.
 *
 * El campo de comisión arranca VACÍO cuando la comisión es heredada, y con el
 * número solo cuando el local la overrideó. Es la diferencia entre "no hay nada
 * decidido acá" y "alguien decidió esto", y si arrancara con el número heredado
 * escrito, el primer Guardar lo convertiría en override sin que nadie lo pida:
 * el local dejaría de seguir la comisión del grupo para siempre.
 */
export function estadoInicialDeMedio(medio, { ordenSugerido = 1 } = {}) {
  return {
    nombre: medio?.nombre ?? "",
    activo: medio ? medio.activo !== false : true,
    orden: String(medio?.orden ?? ordenSugerido),
    recargoPct: String(medio?.recargoPct ?? 0),
    comisionPct: medio && medio.comisionHeredada === false ? String(medio.comisionPct ?? "") : "",
    tipoContable: medio?.tipoContable ?? "",
    // Un medio que YA existe y no tiene procesador eligió no tenerlo. Uno nuevo
    // todavía no eligió nada. Ver `SIN_PROCESADOR`.
    procesador: medio ? (medio.procesador ?? SIN_PROCESADOR) : "",
  };
}

/**
 * QUÉ PASA AL CAMBIAR EL TIPO CONTABLE.
 *
 * El recargo pasa a ser el del tipo NUEVO. No se arrastra el del anterior.
 *
 * `RecargoPagoLocal` está indexado por (local, tipo), así que el recargo no es
 * del botón: es del tipo. Si alguien cambia un medio de débito a crédito y el
 * campo conservara el 3 % del débito, al guardar le escribiría 3 % al crédito
 * —pisando el que tuviera— sin haberlo pedido nunca. Es un número que la gente
 * paga en la caja.
 *
 * Un tipo sin recargo configurado da 0, que es lo mismo que dice el backend
 * cuando no hay fila.
 */
export function aplicarCambioDeTipo(form, tipoContable, recargosPorTipo = {}) {
  return {
    ...form,
    tipoContable,
    recargoPct: String(recargosPorTipo?.[tipoContable] ?? 0),
  };
}

/**
 * QUÉ SE MANDA AL GUARDAR.
 *
 * Lo único delicado es la comisión: el campo vacío viaja como `null`, que el
 * backend lee como "volvé a heredar la del grupo". Un 0 escrito viaja como 0,
 * que es "en este local no se cobra comisión". Convertir uno en el otro sería
 * cambiar lo que se le cobra al comercio sin que nadie lo haya decidido.
 *
 * El recargo va en el MISMO cuerpo, y eso es lo que hace que el guardado sea uno
 * solo: la ruta del medio lo escribe en `RecargoPagoLocal` dentro de su misma
 * transacción. Un segundo pedido desde acá podría fallar después del primero.
 */
export function cuerpoParaGuardar(form) {
  return {
    nombre: form.nombre,
    activo: form.activo,
    orden: Number(form.orden),
    tipoContable: form.tipoContable,
    // Los dos casos —no elegí, elegí que no tenga— viajan como null, que es lo
    // que la base guarda. La diferencia entre ellos es solo de pantalla.
    procesador:
      form.procesador === "" || form.procesador === SIN_PROCESADOR ? null : form.procesador,
    recargoPct: Number(form.recargoPct),
    comisionPct: form.comisionPct === "" ? null : Number(form.comisionPct),
  };
}

/**
 * QUÉ DECIRLE A ALGUIEN SOBRE DE DÓNDE SALE LA COMISIÓN.
 *
 * "7 %" a secas se lee como una decisión que alguien tomó para este local. Si es
 * heredada hay que decirlo, porque el día que cambie la del grupo ésta va a
 * cambiar sola y la otra no.
 */
export function textoOrigenComision(medio) {
  if (!medio?.comisionHeredada) return "Definida en este local";
  return medio?.comisionOrigen === "grupo"
    ? "Heredada del grupo · editable"
    // Antes decía "se usa el valor por defecto", y ese valor por defecto era un
    // 7 % que nadie había decidido. Ya no existe: lo que hay es la ausencia, y
    // se dice.
    : "Sin comisión configurada en el grupo";
}
