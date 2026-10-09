// lib/compras-proveedor/comprobante/lector/escalada.js
//
// CUANDO LA LECTURA DE TODOS LOS DÍAS NO ALCANZA, ENTRA EL MODELO GRANDE.
//
// ── EL OBJETIVO, DE EMANUEL (2026-10-08/09) ───────────────────────────────
//
// Que ningún cliente tenga que configurar ni explicar proveedor por proveedor.
// El modelo grande interpreta la boleta como lo haría una persona y propone
// cómo viene armada; alguien la confirma UNA vez y queda aprendida.
//
// ── CUÁNDO ENTRA, Y CUÁNDO NO ─────────────────────────────────────────────
//
// Flash sigue leyendo todos los días. El grande entra SOLO en tres casos, una
// sola vez por pedido de lectura y nunca en bucle:
//
//   a) FALTAN_RENGLONES — Flash transcribió menos de los que dice ver.
//   b) NO_CIERRA        — con la receta del proveedor, la cuenta no cierra.
//   c) SIN_RECETA       — el proveedor no tiene receta confirmada.
//
// NO entra cuando el papel no trae total (SIN_TOTAL): sin total no hay contra
// qué verificar lo que diga, y una lectura que no se puede verificar no se
// paga dos veces. Tampoco cuando Flash falló sin leer —cuota, servicio
// caído, respuesta cortada—: eso no es que Flash no alcance, es que no hubo
// lectura, y se arregla volviendo a leer.
//
// ── LA PALABRA DEL MODELO GRANDE NO VALE ──────────────────────────────────
//
// Lo que devuelve —la lectura y la receta propuesta— pasa por la MISMA puerta
// que una lectura de Flash: el pie al centavo con la tolerancia de siempre y
// las dos ecuaciones por renglón. Y una tercera, propia de esto: con la receta
// que propuso, los costos de los renglones tienen que ARMAR el total del
// papel. El pie solo no alcanza para juzgar una receta: medido sobre la boleta
// de DYSSA, el pie cierra con cualquier receta porque el papel imprime cada
// IVA, cada percepción y el interno; lo que cambia con la receta es el costo.
// Una receta que dice "el IVA va sobre el interno" cierra el pie y arma
// $639.465,81 sobre un papel de $633.686,40.
//
// Si no cierra, queda lo de Flash y su estado, igual que antes de esta tanda:
// ni costo propuesto, ni receta propuesta.
//
// Este módulo no toca la base ni la red: el intérprete entra por parámetro.

import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { MOTIVO_LECTURA } from "./contrato.js";
import { BASE_DE_PERCEPCION } from "./promptDesdeReceta.js";
import { aCentavos, normalizarReceta, TOLERANCIA_TOTAL_CENTAVOS } from "../impuestos.js";
import { aReceta } from "../recetaEnCriollo.js";
import { papelTieneInterno } from "../internoDelRenglon.js";

/** Los tres casos en que entra el modelo grande. Se guardan en `LlamadaLector.escalada`. */
export const ESCALADA = Object.freeze({
  FALTAN_RENGLONES: "FALTAN_RENGLONES",
  NO_CIERRA: "NO_CIERRA",
  SIN_RECETA: "SIN_RECETA",
});

/**
 * ¿HAY QUE LLAMAR AL MODELO GRANDE? Y si hay, por cuál de los tres casos.
 *
 * @param resultado   lo que devolvió la cadena de Flash
 * @param puerta      lo que dijo la puerta sobre esa lectura
 * @param esGenerica  true si el proveedor no tiene receta confirmada
 * @returns una clave de `ESCALADA`, o null
 */
export function motivoDeEscalada({ resultado, puerta, esGenerica } = {}) {
  if (resultado?.ok !== true || !puerta) return null;
  if (puerta.estado === ESTADO.SIN_TOTAL) return null;
  // El conteo se mira en la lectura y no en `puerta.faltanLineas`: una lectura
  // de CERO renglones sale de la puerta por la rama de "inutilizable", que no
  // cuenta renglones, y es justamente la peor de las cortas.
  const dice = Number(resultado.lectura?.lineasEnElPapel);
  const trajo = Array.isArray(resultado.lectura?.lineas) ? resultado.lectura.lineas.length : 0;
  if (Number.isFinite(dice) && dice > trajo) return ESCALADA.FALTAN_RENGLONES;
  if (!puerta.cierra) return ESCALADA.NO_CIERRA;
  if (esGenerica) return ESCALADA.SIN_RECETA;
  return null;
}

/** Centavos del renglón sin impuestos, como los suma la puerta. */
function netoDelRenglonCentavos(l) {
  const impreso = l?.subtotalImpreso;
  if (impreso !== null && impreso !== undefined) return aCentavos(impreso);
  return aCentavos((Number(l?.netoUnitario) || 0) * (Number(l?.cantidad) || 0));
}

/**
 * DE LA PROPUESTA DEL MODELO A LA RECETA, POR LA MISMA TRADUCCIÓN QUE LA PANTALLA.
 *
 * Lo único que se calcula acá es lo que el modelo NO tiene que calcular: el
 * porcentaje de cada percepción, que es su importe impreso sobre su base. La
 * base sale de los renglones transcriptos —el neto de todo el papel, o el de
 * un grupo de IVA—, y el resultado queda con dos decimales, como lo carga una
 * persona: 13.002,82 sobre 433.427,46 es 3 %.
 *
 * `tieneImpuestoInterno` se deduce de lo transcripto cuando el modelo no lo
 * dice: es un dato derivable, y por eso no se le exige.
 *
 * @returns `{ respuestas, receta }` — las respuestas con la forma de
 *          `aPreguntas`, que es lo que se guarda como propuesta, y la receta
 *          que sale de `aReceta`, que es con la que se verifica.
 */
export function recetaDeLaPropuesta(propuesta, lectura) {
  const p = propuesta || {};
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const alicuotaGeneral = Number.isFinite(Number(p.alicuotaIvaPct)) && p.alicuotaIvaPct !== null
    ? Number(p.alicuotaIvaPct)
    : null;

  const baseCentavos = (alicuota) =>
    lineas
      .filter((l) => alicuota === null || Number(l?.alicuotaIva ?? alicuotaGeneral) === alicuota)
      .reduce((a, l) => a + netoDelRenglonCentavos(l), 0);

  const percepciones = (Array.isArray(p.percepciones) ? p.percepciones : []).map((x) => {
    const porGrupo = x?.base === BASE_DE_PERCEPCION.NETO_DE_SU_ALICUOTA && Number.isFinite(Number(x?.alicuotaPct));
    const grupo = porGrupo ? Number(x.alicuotaPct) : null;
    const base = baseCentavos(grupo);
    const importe = aCentavos(x?.importe);
    return {
      nombre: String(x?.nombre ?? "").trim(),
      // Sin base no hay porcentaje: queda en 0 y `aReceta` la descarta.
      pct: base > 0 ? Math.round((importe * 10000) / base) / 100 : 0,
      ...(grupo !== null ? { alicuotaPct: grupo } : {}),
    };
  });

  const tieneImpuestoInterno =
    typeof p.tieneImpuestoInterno === "boolean"
      ? p.tieneImpuestoInterno
      : lineas.some((l) => Number(l?.internoImpreso) > 0) || papelTieneInterno({ pie: lectura?.pie });

  const respuestas = {
    dondeVieneElIva: p.dondeVieneElIva,
    alicuotaIvaPct: alicuotaGeneral,
    tieneImpuestoInterno,
    ivaIncluyeInternoEnLaBase: p.ivaIncluyeInternoEnLaBase === true,
    percepciones,
    // Decisión de negocio del 2026-08-11, no del modelo: ver `RECETA_POR_DEFECTO`.
    percepcionesEnCosto: true,
    facturaPor: p.facturaPor === "BULTO" ? "BULTO" : "UNIDAD",
  };
  return { respuestas, receta: aReceta(respuestas) };
}

/**
 * ¿LOS COSTOS QUE SALEN DE ESTA RECETA ARMAN EL TOTAL DEL PAPEL?
 *
 * Cada renglón con su neto, su IVA, su parte de las percepciones y su interno,
 * como los calcula `verificarComprobante` para escribir el costo. Sumados
 * tienen que dar el total impreso, con la misma tolerancia que el pie.
 */
export function losRenglonesArmanElTotal(verificacion) {
  const lineas = Array.isArray(verificacion?.lineas) ? verificacion.lineas : [];
  const suma = lineas.reduce(
    (a, l) =>
      a +
      (l.subtotalCentavos || 0) +
      (l.ivaLineaCentavos || 0) +
      (l.percepcionLineaCentavos || 0) +
      (l.internoLineaCentavos || 0),
    0
  );
  const diferenciaCentavos = suma - (verificacion?.totalDeclaradoCentavos ?? 0);
  return { ok: Math.abs(diferenciaCentavos) <= TOLERANCIA_TOTAL_CENTAVOS, diferenciaCentavos };
}

/**
 * EL VEREDICTO SOBRE LO QUE DEVOLVIÓ EL MODELO GRANDE. Lo da el código.
 *
 * Cierra si la puerta dice que cierra, no falta ningún renglón y los costos
 * de la receta propuesta arman el total.
 */
export function verificarLaInterpretacion({ lectura, receta }) {
  const puerta = pasarPorLaPuerta({ lectura, receta });
  if (!puerta.cierra) return { cierra: false, puerta, porque: puerta.porque };
  if (puerta.faltanLineas) return { cierra: false, puerta, porque: puerta.avisoLineas };
  const arma = losRenglonesArmanElTotal(puerta.verificacion);
  if (!arma.ok) {
    return {
      cierra: false,
      puerta,
      porque:
        "El pie cierra, pero con la receta que propuso el lector grande los costos de los " +
        "productos no suman el total del papel. No se propone ningún costo ni receta.",
    };
  }
  return { cierra: true, puerta, porque: null };
}

/** Las partes de la receta que deciden un costo, para comparar dos. */
function loQueDecideElCosto(receta) {
  const r = normalizarReceta(receta);
  return JSON.stringify({
    ivaPorLinea: r.ivaPorLinea === true,
    alicuotaIvaPct: Number(r.alicuotaIvaPct),
    tieneImpuestoInterno: r.tieneImpuestoInterno === true,
    ivaIncluyeInternoEnLaBase: r.ivaIncluyeInternoEnLaBase === true,
    percepcionesEnCosto: r.percepcionesEnCosto !== false,
    facturaPor: r.facturaPor === "BULTO" ? "BULTO" : "UNIDAD",
    percepciones: (r.percepciones || [])
      .map((p) => [Number(p.pct), p.alicuotaPct ?? null])
      .sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]))),
  });
}

/** Por qué no se pudo interpretar, en pocas palabras. */
const RAZON_DE_LA_FALLA = Object.freeze({
  [MOTIVO_LECTURA.TARDO_DEMASIADO]: "tardó más de lo que se lo espera",
  [MOTIVO_LECTURA.LECTURA_CORTADA]: "la respuesta llegó cortada",
  [MOTIVO_LECTURA.CUOTA_AGOTADA]: "se agotó la cuota del servicio",
  [MOTIVO_LECTURA.SERVICIO_CAIDO]: "el servicio no contestó",
});

/** Lo que se le dice a la persona. Uno por desenlace, ninguno en silencio. */
export function textoDeLaEscalada({ cerro, llamo, propone = false, motivoFalla = null, porque = null }) {
  if (!llamo) return null;
  if (cerro) {
    return (
      "Lo leyó el lector grande y la cuenta cierra." +
      (propone
        ? " Además armó cómo viene la boleta de este proveedor: está para confirmar en Recetas de facturas."
        : "")
    );
  }
  if (motivoFalla) {
    return (
      `No se pudo interpretar el papel con el lector grande: ${RAZON_DE_LA_FALLA[motivoFalla] ?? "no contestó"}. ` +
      "Volver a leer puede servir."
    );
  }
  return `Lo leyó también el lector grande y tampoco cierra. ${porque ?? "No se propone ningún costo ni receta."}`;
}

/**
 * LEER CON EL MODELO GRANDE, SI HACE FALTA. UNA SOLA LLAMADA.
 *
 * @param resultado      lo que devolvió la cadena de Flash
 * @param receta         la del proveedor (o la genérica), con su explicación
 * @param recetaVersion  su versión, null si es la genérica
 * @param esGenerica     true si el proveedor no tiene receta confirmada
 * @param interprete     `{ nombre, disponible(), interpretar() }`
 * @param archivos       las mismas fotos que leyó Flash
 *
 * @returns `{ motivo, llamo, llamada, cerro, texto }` y, si cerró, además
 *          `lectura` y `receta` —las que reemplazan a las de Flash— y
 *          `propuesta` con las respuestas a dejar pendientes, o null cuando
 *          coinciden con la receta que ya está confirmada.
 */
export async function escalarAlModeloGrande({
  resultado,
  receta,
  recetaVersion = null,
  esGenerica = false,
  interprete = null,
  archivos = [],
  proveedorNombre = null,
} = {}) {
  const puertaFlash = resultado?.ok === true
    ? pasarPorLaPuerta({ lectura: resultado.lectura, receta, recetaVersion })
    : null;
  const motivo = motivoDeEscalada({ resultado, puerta: puertaFlash, esGenerica });
  const nada = { motivo, llamo: false, llamada: null, cerro: false, texto: null };
  if (!motivo) return nada;
  if (!interprete?.disponible?.().ok) return { ...nada, disponible: false };

  const pro = await interprete.interpretar({
    archivos,
    receta,
    referencia: resultado.lectura,
    motivo,
    proveedorNombre,
  });
  // LA LLAMADA SE ANOTA SIEMPRE, salga como salga: gastó cuota igual, y es la
  // que se cuenta aparte por su `escalada`.
  const llamada = {
    lector: interprete.nombre,
    ok: pro?.ok === true,
    motivo: pro?.ok ? null : pro?.motivo ?? null,
    detalle: pro?.ok ? null : pro?.detalle ?? null,
    escalada: motivo,
  };
  if (pro?.ok !== true) {
    return {
      motivo, llamo: true, llamada, cerro: false,
      texto: textoDeLaEscalada({ llamo: true, cerro: false, motivoFalla: pro?.motivo ?? MOTIVO_LECTURA.SERVICIO_CAIDO }),
    };
  }

  const { respuestas, receta: propuesta } = recetaDeLaPropuesta(pro.propuesta, pro.lectura);
  // La explicación del proveedor viaja con la receta usada, igual que en una
  // lectura de Flash: sin ella, mirando el comprobante dentro de seis meses no
  // se sabe con qué explicación se leyó.
  const recetaUsada = { ...propuesta, explicacion: receta?.explicacion ?? null };
  const veredicto = verificarLaInterpretacion({ lectura: pro.lectura, receta: recetaUsada });
  if (!veredicto.cierra) {
    return {
      motivo, llamo: true, llamada, cerro: false, porque: veredicto.porque,
      texto: textoDeLaEscalada({ llamo: true, cerro: false, porque: veredicto.porque }),
    };
  }

  // Si lo que propuso es lo que ya estaba confirmado, no hay nada que aprender:
  // se lee con la receta de siempre y su versión, y no se deja nada pendiente.
  const igualALaConfirmada = !esGenerica && loQueDecideElCosto(propuesta) === loQueDecideElCosto(receta);
  return {
    motivo,
    llamo: true,
    llamada,
    cerro: true,
    lectura: pro.lectura,
    receta: igualALaConfirmada ? receta : recetaUsada,
    recetaVersion: igualALaConfirmada ? recetaVersion : null,
    propuesta: igualALaConfirmada ? null : respuestas,
    texto: textoDeLaEscalada({ llamo: true, cerro: true, propone: !igualALaConfirmada }),
  };
}
