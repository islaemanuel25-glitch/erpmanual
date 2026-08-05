// lib/proveedores/listas/registro.js
//
// QUÉ PARSER USA CADA PROVEEDOR.
//
// ── POR QUÉ NO SE RECONOCE POR EL NOMBRE ────────────────────────────────────
//
// Sería cómodo mirar `Proveedor.nombre` y ver si dice "Arcor". Es exactamente lo
// que no hay que hacer. Dos proveedores pueden llamarse parecido, alguien puede
// escribir "ARCOR SAIC" o "Distribuidora Arcor", y el día que un parser
// equivocado lea el archivo de otro va a interpretar una columna por otra: en la
// exportación con códigos de barras, "Precio C/IVA" está donde el formato de
// agosto tiene "Precio S/IVA", y un EAN de trece dígitos entraría como precio.
// No se rompe nada visible: quedan costos absurdos.
//
// Por eso la relación proveedor → parser es un dato EXPLÍCITO que carga el
// administrador en `Proveedor.parserListaId`, y este archivo es la lista cerrada
// de valores que ese campo admite. Un proveedor sin el campo cargado no importa
// listas, y lo dice con todas las letras.
//
// ── CÓMO SE HABILITA ARCOR ──────────────────────────────────────────────────
//
// Una vez, a mano, sobre el proveedor real:
//   UPDATE "Proveedor" SET "parserListaId" = 'ARCOR_XLSX' WHERE id = <el id>;
// No hay backfill automático: adivinar cuál de los proveedores existentes es
// Arcor es justamente lo que este módulo evita.

import { parsearListaArcor } from "./parsers/arcor.js";
import { CONFIG_ARCOR } from "./configuraciones/arcor.js";

/** Identificadores válidos de `Proveedor.parserListaId`. Lista cerrada. */
export const PARSER_LISTA = {
  ARCOR_XLSX: "ARCOR_XLSX",
};

/**
 * El registro. Cada entrada ata un identificador con su parser, su configuración
 * comercial y una versión.
 *
 * La VERSIÓN se guarda en cada importación: cuando dentro de seis meses alguien
 * mire una conciliación vieja y los números no cuadren con las reglas de
 * entonces, el número de versión es lo que explica por qué.
 */
const REGISTRO = {
  [PARSER_LISTA.ARCOR_XLSX]: {
    id: PARSER_LISTA.ARCOR_XLSX,
    etiqueta: "Arcor — lista de precios (.xlsx)",
    parser: parsearListaArcor,
    parserVersion: "1.0.0",
    config: CONFIG_ARCOR,
    extensiones: [".xlsx"],
  },
};

/** ¿Este identificador existe? */
export function parserRegistrado(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(REGISTRO, id);
}

/**
 * Resuelve el parser de un proveedor a partir del dato guardado.
 *
 * Devuelve `{ ok: false, error }` en vez de lanzar: el endpoint tiene que poder
 * contestar con un mensaje que le sirva a quien subió el archivo.
 */
export function resolverParserDeProveedor(proveedor) {
  const id = proveedor?.parserListaId ?? null;
  if (!id) {
    return {
      ok: false,
      codigo: "PROVEEDOR_SIN_PARSER",
      error:
        "Este proveedor no tiene configurado un formato de lista de precios. Cargalo antes de importar.",
    };
  }
  if (!parserRegistrado(id)) {
    return {
      ok: false,
      codigo: "PARSER_DESCONOCIDO",
      error: `El formato de lista "${id}" no está soportado.`,
    };
  }
  return { ok: true, ...REGISTRO[id] };
}

/** Los identificadores disponibles, para poder ofrecerlos en una pantalla. */
export function listarParsers() {
  return Object.values(REGISTRO).map((r) => ({
    id: r.id,
    etiqueta: r.etiqueta,
    parserVersion: r.parserVersion,
    extensiones: r.extensiones,
  }));
}
