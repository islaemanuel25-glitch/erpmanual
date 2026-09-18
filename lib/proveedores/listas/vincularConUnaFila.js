// ATAR UN PRODUCTO DEL CATÁLOGO A UN RENGLÓN DE ESTA LISTA.
//
// ── POR QUÉ ESTE MÓDULO EXISTE ─────────────────────────────────────────────
//
// Porque hay DOS pantallas que hacen exactamente esto y llegan desde lados
// distintos:
//
//   «No es este producto»   una fila de la lista está atada al producto
//                           equivocado, y hay que moverla al renglón correcto.
//   «Buscarlo en la lista»  un producto del catálogo no apareció en la lista, y
//                           casi siempre es porque el código guardado está mal:
//                           el renglón está, con otro nombre y otro código.
//
// Son dos preguntas y dos pantallas, pero UNA sola operación: desactivar el
// código viejo, guardar el de la fila elegida, y volver a conciliar ese renglón.
// Escribir la segunda al lado de la primera sería la copia que el CLAUDE.md
// prohíbe, y lo que se separaría el día que una cambie es qué código queda
// guardado para un producto — o sea qué costo se le escribe el mes que viene.
//
// ── LA DIFERENCIA ENTRE LAS DOS, QUE ES LA ÚNICA ───────────────────────────
//
// Desde «No es este producto» hay un renglón VIEJO que queda libre. Desde
// «Buscarlo en la lista» no hay ninguno: el producto no estaba en ningún renglón,
// que es justamente el problema. Por eso `filaVieja` es opcional y no un
// parámetro más que haya que inventarle un valor.
//
// Módulo con Prisma solo en las funciones que escriben; las que deciden son puras
// y se pueden probar sin base.

import { parecidoNombre } from "./conciliarLista.js";
import { clavesDeCodigo } from "./normalizarCodigo.js";
import { ORIGEN_ALTA_VINCULO } from "./vinculacion.js";
// El normalizador de texto del ERP, el mismo que usa `vincular`: si el vínculo
// nuevo guardara la descripción normalizada con otras reglas, no participaría de
// la misma búsqueda que los demás.
import { normalizarTexto } from "../../productos/busquedaFuzzyProducto.js";

/** Cuántas candidatas se ofrecen. Más que esto no se lee en un teléfono. */
export const TOPE_CANDIDATAS = 30;

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * LAS FILAS DE LA LISTA, ORDENADAS POR PARECIDO AL NOMBRE DEL PRODUCTO.
 *
 * ── CONTRA QUÉ SE COMPARA, Y POR QUÉ IMPORTA ──────────────────────────────
 *
 * Contra el nombre DEL PRODUCTO que la persona está mirando, no contra la
 * descripción del renglón que hoy tiene: esa es justamente la que se sospecha
 * equivocada. Es lo que hace que "ala 800 lavado total con bica" encuentre
 * "ALA PVO LAV MANO C BICARBONATO 24X800".
 *
 * El parecido se le pregunta a `parecidoNombre`, la misma función con la que el
 * motor sugiere por nombre. Escribir acá otra medida haría que la pantalla
 * ordenara distinto de como sugiere el motor sobre los mismos dos nombres.
 *
 * @param filas             las filas de la importación, ya traídas de la base
 * @param nombreDelProducto el nombre de la ficha del catálogo
 * @param productoBaseId    para saber cuáles están tomadas por OTRO producto
 * @param filaActualId      la que está ahora, si se viene de «No es este
 *                          producto». Null desde «Buscarlo en la lista».
 */
export function candidatasConPuntaje({
  filas = [],
  nombreDelProducto = "",
  productoBaseId = null,
  filaActualId = null,
} = {}) {
  const conPuntaje = filas.map((c) => ({
    ...c,
    puntaje: parecidoNombre(nombreDelProducto, c.descripcionProveedor ?? ""),
  }));
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje);

  return conPuntaje.slice(0, TOPE_CANDIDATAS).map((c) => ({
    id: c.id,
    codigo: c.codigoCrudo,
    descripcion: c.descripcionProveedor,
    unidad: c.unidadProveedor,
    cantidad: c.unidadesPorBulto,
    precio: numero(c.precioConIva),
    // ── SI YA ESTÁ TOMADA POR OTRO PRODUCTO, SE DICE ─────────────────────
    //
    // Elegir una fila que ya es de otro producto no es un error —puede ser que
    // ESE sea el mal vinculado— pero la persona tiene que verlo antes de
    // decidir, no después.
    tomadaPor:
      c.productoBaseId && c.productoBaseId !== productoBaseId
        ? c.productoBase?.nombre ?? null
        : null,
    laQueEstaba: filaActualId !== null && c.id === filaActualId,
  }));
}

// ── LO QUE NO SE MUDÓ ACÁ, Y POR QUÉ ──────────────────────────────────────
//
// `desvinculada()` —los campos que dejan una fila sin producto— se queda en
// `otra-fila`, que es el único que desvincula: «Buscarlo en la lista» solo ATA,
// porque el producto no estaba en ningún renglón.
//
// Y se queda por un motivo concreto, no por comodidad: al escribirla acá de
// memoria le faltaron TRES campos que la de allá sí limpia —`vinculadoEn`,
// `fueraDeRangoAceptadaEn` y `excluidaManual`—. Una pieza sacada de memoria en vez
// de copiada de la pantalla que hoy funciona es exactamente lo que el CLAUDE.md
// prohíbe, y el costo habría sido una fila desvinculada a medias: sin producto,
// pero con la aceptación de un costo fuera de rango todavía puesta.
//
// Cuando haga falta compartirla, se muda copiada y con su candado, no reescrita.

/**
 * TODOS los códigos activos que este producto tiene con este proveedor, apagados.
 *
 * ── POR QUÉ NO ALCANZA CON APAGAR UNO ─────────────────────────────────────
 *
 * Porque desde «Buscarlo en la lista» no se sabe cuál era el equivocado. El
 * producto no apareció en la lista, y el motivo puede ser que tenga UN código
 * mal o que tenga varios de arrastre, ninguno de los cuales está en este archivo.
 * Apagar solo el que uno cree que es el malo dejaría el otro machando el mes que
 * viene y el problema volvería sin que nadie entienda por qué.
 *
 * No se apaga el que se está por guardar: eso lo resuelve el orden —primero esto,
 * después el upsert que lo activa— y se afirma en un candado, porque invertirlo
 * dejaría al producto sin ningún código activo y sin nada que avise.
 */
export async function desactivarCodigosDelProducto(tx, { grupoId, proveedorId, productoBaseId }) {
  await tx.productoCodigoProveedor.updateMany({
    where: { grupoId, proveedorId, productoBaseId, activo: true },
    data: { activo: false },
  });
}

/**
 * El código de la fila elegida queda guardado PARA SIEMPRE.
 *
 * Las próximas listas de este proveedor van a usarlo para este producto sin
 * preguntar. Es el pedido de Emanuel con todas las letras —lo que se explica una
 * vez no se vuelve a explicar— y por eso se persiste en el vínculo y no en la
 * fila, que muere con la importación.
 */
export async function guardarCodigoDeLaFila(tx, { grupoId, proveedorId, productoBaseId, fila }) {
  const codigo = fila?.codigoNormalizado ?? fila?.codigoCrudo ?? null;
  const { normalizado } = clavesDeCodigo(codigo);
  if (!normalizado) return null;

  const descripcion = fila?.descripcionProveedor ?? null;

  // El único se llama `codigo_interno_unico_por_proveedor` y NO es el nombre que
  // Prisma arma solo: el modelo lo nombra a mano. Con el nombre por default esto
  // ni siquiera compila el tipo, y con la forma equivocada fallaría recién contra
  // Postgres.
  await tx.productoCodigoProveedor.upsert({
    where: {
      codigo_interno_unico_por_proveedor: { grupoId, proveedorId, codigoInterno: normalizado },
    },
    create: {
      grupoId,
      proveedorId,
      productoBaseId,
      codigoInterno: normalizado,
      // La descripción cruda Y la normalizada, como las escribe `vincular`: la
      // normalizada es la que indexa el macheo por nombre, y dejarla en null
      // haría que este vínculo no participe de esa búsqueda.
      descripcionProveedor: descripcion,
      descripcionNormalizada: descripcion ? normalizarTexto(descripcion) : null,
      activo: true,
      // ── `MANUAL` NO EXISTE, Y NADIE SE ENTERÓ ─────────────────────────────
      //
      // La clave es `VINCULACION_MANUAL`. `ORIGEN_ALTA_VINCULO.MANUAL` es
      // `undefined`, y Prisma guarda un `undefined` como si el campo no se
      // hubiera mandado: la columna queda en null, sin error y sin aviso.
      //
      // Venía así de `otra-fila`, de donde esta función se copió, así que TODOS
      // los vínculos hechos desde «No es este producto» quedaron con
      // `origenAlta` nulo. Importa porque `servicioIdentidad` lee exactamente
      // `origenAlta === VINCULACION_MANUAL` para decir que un vínculo lo
      // confirmó una persona: con null, una decisión tomada a mano se trataba
      // como una corazonada del motor.
      //
      // Lo encontró mirar la fila en Postgres después de vincular. No lo podía
      // atrapar el build —el proyecto es JavaScript y una propiedad que no
      // existe vale `undefined`— ni un candado que no mirara el valor escrito.
      // El que lo mira ahora está en `vincularConUnaFila.test.mjs`.
      origenAlta: ORIGEN_ALTA_VINCULO.VINCULACION_MANUAL,
    },
    update: {
      productoBaseId,
      activo: true,
      descripcionProveedor: descripcion,
      descripcionNormalizada: descripcion ? normalizarTexto(descripcion) : null,
    },
  });

  return normalizado;
}

// ── LO QUE EL MOTOR NECESITA, EN UN SOLO LUGAR Y COPIADO ────────────────────
//
// ESTO SE MUDÓ ACÁ POR UN DEFECTO CONCRETO, NO POR ORDEN. Las tres piezas de
// abajo —qué campos se le piden al producto, con qué nombres se le pasan al
// motor, y el contexto de la lista— estaban escritas dentro de `otra-fila`. Al
// escribir «Buscarlo en la lista» se rehicieron de memoria y salieron con OTROS
// NOMBRES: `precioCosto` por `precioCostoActual`, `factor_pack` por `factorPack`,
// y sin `creadoEnLocalId` ni `esCombo`.
//
// Ninguna de las dos cosas que suelen avisar avisó. El build compiló —una
// propiedad que no existe vale `undefined`, no es un error— y los candados
// quedaron en verde. Lo que pasó de verdad: el motor recibió
// `creadoEnLocalId: undefined`, concluyó que el local que opera no puede tocar el
// costo, y guardó la fila como BLOQUEADO / SIN_PROPIEDAD_COSTO. Un veredicto
// perfectamente coherente, escrito en la base, sobre un dato que nunca le
// llegó. Lo encontró mirar la fila en Postgres después de vincular.
//
// Así que están acá, copiadas letra por letra de `otra-fila`, que es la pantalla
// que HOY funciona, y las dos rutas las piden a la misma función. Dos formas del
// mismo objeto no se rompen el día que se escriben: se rompen el día que una
// cambia.

/** Los campos del producto que el motor mira. Cambiar esto es cambiar su entrada. */
export const CAMPOS_PRODUCTO_PARA_EL_MOTOR = {
  id: true,
  nombre: true,
  precio_costo: true,
  factor_pack: true,
  unidad_medida: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  creadoEnLocalId: true,
  es_combo: true,
};

/** Los campos de la cabecera que el motor mira, más los que la ruta necesita. */
export const CAMPOS_CABECERA_PARA_EL_MOTOR = {
  id: true,
  estado: true,
  proveedorId: true,
  recargoPct: true,
  parser: true,
  aumentoEsperadoMinPct: true,
  aumentoEsperadoMaxPct: true,
  impuestoAdicionalPct: true,
  modo: true,
};

/**
 * El producto con los nombres que el motor usa.
 *
 * `creadoEnLocalId` y `esCombo` no son decorado: son los dos que deciden si el
 * costo se puede escribir, antes de calcular nada. Faltando, el motor bloquea.
 */
export function productoParaElMotor(producto) {
  return {
    productoBaseId: producto.id,
    nombre: producto.nombre,
    precioCostoActual: numero(producto.precio_costo),
    factorPack: producto.factor_pack,
    unidadMedida: producto.unidad_medida,
    modoCompraProveedor: producto.modoCompraProveedor,
    pesoReferenciaKg: numero(producto.pesoReferenciaKg),
    creadoEnLocalId: producto.creadoEnLocalId,
    esCombo: producto.es_combo === true,
    codigosBarra: [],
  };
}

/**
 * La configuración y el contexto con los que se vuelve a conciliar UNA fila.
 *
 * La CABECERA VIAJA ENTERA y no en pedazos convertidos a número: el motor le
 * pregunta a `rangoDeLaFila` y a `modoDeImportacion`, que la leen ellos. Armarle
 * una cabecera "ya masticada" acá es adivinar qué va a leer, y el rango de
 * aumento esperado —o el modo de la lista— saldría de lo que uno creyó.
 */
export function motorParaEstaLista({ cab, reg, grupoId, operandoEnLocalId, depositoLocalId }) {
  return {
    config: {
      ...reg.config,
      recargoPct: Number(cab.recargoPct ?? 0),
      impuestoAdicionalPct: numero(cab.impuestoAdicionalPct),
      umbralVariacionPct: numero(cab.aumentoEsperadoMaxPct),
    },
    contexto: {
      grupoId,
      proveedorId: cab.proveedorId,
      operandoEnLocalId,
      depositoLocalId,
      cabecera: cab,
    },
  };
}

/**
 * La fila elegida, con la forma que el motor consume.
 *
 * ── LO QUE NO VIAJA, Y ES DELIBERADO ──────────────────────────────────────
 *
 * La confirmación de lectura. Si alguien había confirmado cómo se leía el precio
 * de este renglón, esa respuesta se tomó cuando el renglón era de otro producto
 * —otra unidad, otra cantidad, otro precio—. Arrastrarla haría que una decisión
 * tomada sobre un producto habilitara la escritura del costo de otro.
 */
export function filaParaElMotor(fila, { vinculadoEn }) {
  return {
    filaExcel: fila.filaExcel,
    hojaNombre: fila.hojaNombre,
    codigoCrudo: fila.codigoCrudo,
    codigoNormalizado: fila.codigoNormalizado,
    codigoComparableSinCeros: fila.codigoComparableSinCeros,
    codigoBarraProveedor: fila.codigoBarraProveedor,
    descripcionProveedor: fila.descripcionProveedor,
    unidadProveedor: fila.unidadProveedor,
    unidadesPorBulto: fila.unidadesPorBulto,
    precioConIva: numero(fila.precioConIva),
    precioSinIva: numero(fila.precioSinIva),
    categoriaCruda: fila.categoriaCruda,
    confirmadoEn: null,
    vinculadoEn,
    aumentoEsperadoMinPct: null,
    aumentoEsperadoMaxPct: null,
  };
}
