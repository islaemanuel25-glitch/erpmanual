// EL CONOCIMIENTO COMPARTIDO DE UN PROVEEDOR, EN UN SOLO LUGAR.
//
// ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────────────
//
// Hoy hay dos módulos que aprenden lo mismo por separado. Listas de precios
// guarda un vínculo cuando alguien lo elige a mano o cuando una fila se aplica;
// Facturas guarda otro al crear el borrador. Los dos escriben en la misma tabla
// y ninguno lee lo que el otro sabe sobre la PRESENTACIÓN — así que el mes que
// viene la lista vuelve a preguntar el factor que la factura ya confirmó.
//
// Este módulo es la única puerta. Es puro: decide qué se guarda y con qué
// procedencia, y quien llama escribe. No importa Prisma a propósito, para que
// las reglas se puedan probar sin base.
//
// ── LOS TRES HECHOS QUE NO SE MEZCLAN ──────────────────────────────────────
//
//   origenAlta        QUIÉN lo creó: una persona o el motor.
//   metodoDeteccion   CÓMO se encontró: código exacto, alias, aproximado…
//   confirmadaEn      SI alguien lo miró y dijo que sí, y cuándo.
//
// Son tres preguntas distintas y por eso son tres columnas. Con una sola no se
// puede contestar "esto lo dedujo el motor por terminación y después una persona
// lo confirmó", que es el caso más común y el que hay que poder revocar aparte.
//
// El nivel de certeza NO es una cuarta columna: es un predicado que lee las
// tres juntas. Guardarlo sería un cuarto hecho que se contradice con los otros
// el día que uno se escriba y el otro no.

import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";
import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { MOTIVO_CANDIDATO } from "./motorCandidatos.js";

/** QUIÉN dio de alta el vínculo. Espeja `ORIGEN_ALTA_VINCULO` de Listas. */
export const ORIGEN_ALTA = Object.freeze({
  VINCULACION_MANUAL: "VINCULACION_MANUAL",
  APLICACION_AUTOMATICA: "APLICACION_AUTOMATICA",
});

/** CÓMO se encontró. Los mismos nombres que devuelve el motor de candidatos. */
export const METODO_DETECCION = Object.freeze({
  MANUAL: "MANUAL",
  CODIGO_EXACTO: MOTIVO_CANDIDATO.CODIGO_EXACTO,
  ALIAS_CONFIRMADO: MOTIVO_CANDIDATO.ALIAS_CONFIRMADO,
  NOMBRE_EXACTO: MOTIVO_CANDIDATO.NOMBRE_EXACTO,
  APROXIMADO: MOTIVO_CANDIDATO.APROXIMADO,
});

/**
 * Los cuatro niveles que la pantalla tiene que poder distinguir.
 *
 * SUGERENCIA no se persiste nunca: es el estado de algo que todavía no es una
 * asociación. Está en el enum para que la pantalla pueda nombrarlo con el mismo
 * vocabulario, no para guardarlo.
 */
export const CERTEZA = Object.freeze({
  CONFIRMADA_USUARIO: "CONFIRMADA_USUARIO",
  EXACTA: "EXACTA",
  INFERIDA: "INFERIDA",
  SUGERENCIA: "SUGERENCIA",
});

export const TEXTO_CERTEZA = Object.freeze({
  [CERTEZA.CONFIRMADA_USUARIO]: "Confirmado por una persona",
  [CERTEZA.EXACTA]: "Coincidencia exacta de código o alias",
  [CERTEZA.INFERIDA]: "Deducido automáticamente",
  [CERTEZA.SUGERENCIA]: "Sugerencia sin confirmar",
});

/**
 * El nivel de certeza de un vínculo guardado.
 *
 * Lee los tres hechos juntos. El orden importa: una confirmación humana gana
 * sobre cómo se encontró, porque alguien lo miró DESPUÉS.
 */
export function nivelDeCerteza(vinculo) {
  if (!vinculo) return CERTEZA.SUGERENCIA;
  if (vinculo.confirmadaEn) return CERTEZA.CONFIRMADA_USUARIO;
  if (vinculo.origenAlta === ORIGEN_ALTA.VINCULACION_MANUAL) return CERTEZA.CONFIRMADA_USUARIO;
  const metodo = vinculo.metodoDeteccion;
  if (metodo === METODO_DETECCION.CODIGO_EXACTO || metodo === METODO_DETECCION.ALIAS_CONFIRMADO) {
    return CERTEZA.EXACTA;
  }
  // Sin método declarado —los vínculos anteriores a la columna— no se puede
  // afirmar que fueran exactos. Se los trata como inferidos: es el nivel más
  // bajo que sigue siendo un vínculo, y no inventa un dato que no consta.
  return CERTEZA.INFERIDA;
}

/**
 * EL FACTOR DE CONVERSIÓN, DERIVADO Y NO GUARDADO.
 *
 * El proveedor cotiza "Gancia x6" y el ERP maneja "Gancia pack x24": cada
 * importe facturado por x6 vale por cuatro en el pack. Ese 4 es 24 ÷ 6.
 *
 * ── POR QUÉ NO SE GUARDA EL 4 ──────────────────────────────────────────────
 *
 * Porque es derivable, y un dato derivable guardado se pudre solo. El día que el
 * pack del ERP pase de 24 a 12, un 4 guardado seguiría multiplicando por cuatro
 * un pack que ahora vale dos. Lo que se guarda es lo ÚNICO que el ERP no sabe:
 * cuántas unidades trae la presentación del proveedor.
 *
 * Devuelve null cuando falta cualquiera de los dos lados. Null y no 1: "no sé
 * convertir" y "no hay que convertir" son cosas distintas, y un 1 por omisión
 * escribiría el precio del x6 como si fuera el del pack.
 */
export function factorDeConversion({ unidadesPorPresentacion, factorPackErp } = {}) {
  const proveedor = Number(unidadesPorPresentacion);
  const erp = Number(factorPackErp);
  if (!Number.isFinite(proveedor) || proveedor <= 0) return null;
  if (!Number.isFinite(erp) || erp <= 0) return null;
  const factor = erp / proveedor;
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

/**
 * La presentación del proveedor y la del ERP, listas para mostrar juntas.
 *
 * La del ERP NO se guarda en el vínculo: es un hecho del producto y se lee de
 * él. Guardarla sería un segundo lugar donde dice cuántas unidades trae un pack,
 * y el día que difieran nadie sabría cuál vale.
 */
export function presentacionesDe({ vinculo, productoBase } = {}) {
  const unidadesProveedor = Number(vinculo?.unidadesPorPresentacion);
  const factorPackErp = Number(productoBase?.factor_pack ?? productoBase?.factorPack);
  return {
    proveedor: vinculo?.presentacionProveedor ?? null,
    unidadesProveedor: Number.isFinite(unidadesProveedor) && unidadesProveedor > 0 ? unidadesProveedor : null,
    erp: presentacionErp(productoBase),
    unidadesErp: Number.isFinite(factorPackErp) && factorPackErp > 0 ? factorPackErp : null,
    factor: factorDeConversion({
      unidadesPorPresentacion: unidadesProveedor,
      factorPackErp,
    }),
  };
}

/** Texto corto de la presentación del ERP. Misma forma que en Listas. */
function presentacionErp(productoBase) {
  if (!productoBase) return null;
  const u = String(productoBase.unidad_medida ?? productoBase.unidadMedida ?? "").toLowerCase();
  const f = Number(productoBase.factor_pack ?? productoBase.factorPack ?? 0);
  if (u === "kg") return "Kg";
  if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
  if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
  return f > 1 ? `Unidad (x${f})` : "Unidad";
}

/** La clave con la que se recuerda una descripción sin código. */
export function claveDeAlias(descripcion) {
  const norm = normalizarTexto(descripcion);
  return norm ? `TXT:${norm.slice(0, 60)}` : null;
}

/**
 * LAS FILAS A ESCRIBIR PARA RECORDAR UNA ASOCIACIÓN.
 *
 * ── POR QUÉ PUEDEN SER DOS Y NO UNA ────────────────────────────────────────
 *
 * Un renglón puede traer código Y descripción. Guardar solo el código deja al
 * proveedor sin memoria de cómo LLAMA al producto, así que el próximo documento
 * que venga sin código vuelve a preguntar lo mismo. Y guardar solo la
 * descripción pierde el código.
 *
 * Se escriben las dos, apuntando al MISMO producto. Eso también es lo que hace
 * que una corrección no deje dos asociaciones contradictorias: las dos claves de
 * ese renglón se reescriben juntas.
 *
 * ── LA PROCEDENCIA NO SE INVENTA ───────────────────────────────────────────
 *
 * `origenAlta` sale de si hubo una persona, y NO de dónde se llamó a esta
 * función. Una deducción del motor guardada como VINCULACION_MANUAL vuelve
 * irrevocable lo que justamente hay que poder revocar el día que salga mal: la
 * columna existe para separar los deducidos de los humanos, y llenarla mal la
 * apaga sin que nadie lo note.
 */
export function filasDeIdentidad({
  grupoId,
  proveedorId,
  productoBaseId,
  codigoProveedor = null,
  descripcionProveedor = null,
  metodoDeteccion = METODO_DETECCION.APROXIMADO,
  confirmadaPorUsuarioId = null,
  confirmadaEn = null,
  presentacionProveedor = null,
  unidadesPorPresentacion = null,
} = {}) {
  if (!grupoId || !proveedorId || !productoBaseId) return [];

  const confirmada = Boolean(confirmadaPorUsuarioId && confirmadaEn);
  const descripcion = String(descripcionProveedor ?? "").trim() || null;
  const codigo = normalizarCodigo(codigoProveedor);
  const alias = claveDeAlias(descripcion);

  // Sin código NI descripción no hay con qué reconocerlo la próxima vez.
  if (!codigo && !alias) return [];

  const unidades = Number(unidadesPorPresentacion);
  const comun = {
    grupoId: Number(grupoId),
    proveedorId: Number(proveedorId),
    productoBaseId: Number(productoBaseId),
    descripcionProveedor: descripcion,
    descripcionNormalizada: descripcion ? normalizarTexto(descripcion) : null,
    presentacionProveedor: presentacionProveedor ? String(presentacionProveedor).trim() : null,
    unidadesPorPresentacion: Number.isInteger(unidades) && unidades > 0 ? unidades : null,
    activo: true,
    metodoDeteccion: metodoDeteccion || METODO_DETECCION.APROXIMADO,
    origenAlta: confirmada ? ORIGEN_ALTA.VINCULACION_MANUAL : ORIGEN_ALTA.APLICACION_AUTOMATICA,
    confirmadaPorUsuarioId: confirmada ? Number(confirmadaPorUsuarioId) : null,
    confirmadaEn: confirmada ? confirmadaEn : null,
  };

  const filas = [];
  if (codigo) filas.push({ ...comun, codigoInterno: codigo });
  // El alias solo se guarda si aporta algo: si es igual al código, sería la
  // misma fila dos veces con distinta clave.
  if (alias && alias !== codigo) filas.push({ ...comun, codigoInterno: alias });
  return filas;
}

/**
 * ¿Una escritura nueva puede pisar la que ya está?
 *
 * ── UNA DEDUCCIÓN NO PISA UNA CONFIRMACIÓN ─────────────────────────────────
 *
 * Es la regla que hace que compartir el conocimiento no sea peligroso. Si el
 * motor pudiera reescribir lo que una persona confirmó, cada documento nuevo
 * tendría la chance de deshacer una decisión humana en silencio — y el módulo
 * que la deshaga puede ser el otro, que ni siquiera está abierto.
 *
 * Al revés sí: una persona corrige lo que el motor dedujo, y ahí la asociación
 * queda confirmada.
 */
export function puedePisar({ existente, entrante } = {}) {
  if (!existente) return { pisa: true, motivo: "NUEVA" };
  const certezaExistente = nivelDeCerteza(existente);
  const entranteConfirmada = Boolean(entrante?.confirmadaEn);

  // ── EL MISMO PRODUCTO SE PREGUNTA PRIMERO ────────────────────────────────
  //
  // Y el orden no es cosmético. Con el guard de la confirmación adelante, releer
  // un documento sobre un vínculo YA confirmado no actualizaba nada: ni la
  // presentación que el papel ahora sí trae, ni la descripción nueva. Una
  // confirmación no es un candado sobre los datos del producto, es un candado
  // sobre A QUÉ PRODUCTO apunta. Si el producto es el mismo, no hay nada que
  // proteger.
  if (Number(existente.productoBaseId) === Number(entrante?.productoBaseId)) {
    return { pisa: true, motivo: "MISMO_PRODUCTO" };
  }
  if (certezaExistente === CERTEZA.CONFIRMADA_USUARIO && !entranteConfirmada) {
    return { pisa: false, motivo: "CONFIRMADA_NO_SE_PISA_CON_DEDUCCION" };
  }
  return { pisa: true, motivo: entranteConfirmada ? "CORRECCION_HUMANA" : "REEMPLAZO" };
}

/**
 * El `update` de un upsert, conservando lo que no hay que perder.
 *
 * ── LO QUE NO SE PIERDE ────────────────────────────────────────────────────
 *
 * Si el que está guardado lo confirmó una persona y el que entra no, se
 * conservan la confirmación y su autoría. Sin esto, cada relectura de un
 * documento borraría quién decidió qué — que es la mitad de para qué existen
 * esas columnas.
 *
 * Y la presentación se conserva cuando la entrante no la trae: un documento que
 * no dice el armado no puede borrar el que otro sí dijo.
 */
export function datosDeActualizacion({ existente, entrante } = {}) {
  const decision = puedePisar({ existente, entrante });
  if (!decision.pisa) return { actualizar: false, motivo: decision.motivo, data: null };

  const conservaConfirmacion = Boolean(existente?.confirmadaEn) && !entrante?.confirmadaEn;
  return {
    actualizar: true,
    motivo: decision.motivo,
    data: {
      productoBaseId: entrante.productoBaseId,
      descripcionProveedor: entrante.descripcionProveedor ?? existente?.descripcionProveedor ?? null,
      descripcionNormalizada: entrante.descripcionNormalizada ?? existente?.descripcionNormalizada ?? null,
      presentacionProveedor: entrante.presentacionProveedor ?? existente?.presentacionProveedor ?? null,
      unidadesPorPresentacion:
        entrante.unidadesPorPresentacion ?? existente?.unidadesPorPresentacion ?? null,
      metodoDeteccion: entrante.metodoDeteccion ?? existente?.metodoDeteccion ?? null,
      origenAlta: conservaConfirmacion ? existente.origenAlta : entrante.origenAlta,
      confirmadaPorUsuarioId: conservaConfirmacion
        ? existente.confirmadaPorUsuarioId
        : entrante.confirmadaPorUsuarioId,
      confirmadaEn: conservaConfirmacion ? existente.confirmadaEn : entrante.confirmadaEn,
      activo: true,
    },
  };
}
