// LA RECEPCIÓN REPRESENTA LO QUE LLEGÓ, NO LO QUE SE MANDÓ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/recepcionDiferencias.test.mjs
//
// ── LOS DOS HECHOS QUE EL SISTEMA NO PODÍA REPRESENTAR ─────────────────────
//
// Hasta el 2026-09-08 la recepción solo sabía recibir MENOS de lo enviado.
// Faltaban los dos casos que ocurren al abrir los bultos:
//
//   · llegó MÁS de lo que decía el remito;
//   · llegó un producto que el remito ni menciona.
//
// El tope `recibido <= enviado` no era una regla de negocio: era la consecuencia
// de que la aritmética posterior solo supiera SUMAR al origen. Por eso sacarlo
// sin cambiar la aritmética habría acreditado al destino stock que nunca salió.
//
// ── LA FÓRMULA, UNA SOLA PARA LOS TRES CASOS ───────────────────────────────
//
//     destino           += R
//     origen.enTransito -= S      (salvo línea agregada: nunca tuvo reserva)
//     origen.cantidad   += (S - R)
//
// El tercer término tiene SIGNO, y eso es todo lo que cambió.
//
// ── QUÉ SE PRUEBA ACÁ Y QUÉ NO ─────────────────────────────────────────────
//
// Acá va la aritmética —pura, sin base— y los invariantes ESTRUCTURALES de las
// rutas, leídos sobre el fuente sin comentarios para no validar contra prosa.
// Lo que necesita PostgreSQL de verdad —que un producto de otro origen se
// rechace, que borrar una línea no mueva stock, que la confirmación duplicada
// falle— se ejerce en `scripts/pruebas-db/recepcionTransferencias.mjs`, que
// corre después de `migrate deploy`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCIONES_RECEPCION,
  ERRORES_RECEPCION,
  accionAuditoriaDe,
  aMilesimas,
  calcularAjusteOrigenUnidades,
  validarDetalleRecepcion,
} from "./recepcion.js";
import { esEditableEnRecepcion, puedeRecibir, estadoAdmiteRecepcion } from "./recepcionServidor.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CONFIRMAR = "app/api/transferencias/confirmar-recepcion/route.js";
const GUARDAR = "app/api/transferencias/guardar-recepcion/route.js";
const LINEA = "app/api/transferencias/linea-recepcion/route.js";
const BUSCAR = "app/api/transferencias/buscar-productos-origen/route.js";
const BUSCADOR = "lib/productos/buscarCatalogoLocal.js";
const POS_BUSCAR = "app/api/pos-transferencias/buscarProductos/route.js";

/**
 * Un plan validado. `motivoPrincipal` va siempre porque toda diferencia lo exige
 * —la regla existía y no se tocó—, y acá lo que se mide es la aritmética.
 */
const plan = ({ cantidad, recibido, unidad = "UNIDAD", factorPack = 1, agregado = false }) =>
  validarDetalleRecepcion({
    detalle: {
      cantidad,
      recibido,
      unidadEnviada: unidad,
      motivoPrincipal: "Diferencia",
      agregadoEnRecepcion: agregado,
    },
    factorPack,
  });

/**
 * El neto del origen después de una recepción, partiendo de un stock conocido.
 * Reproduce las DOS escrituras que hace la ruta, para que el número de estos
 * tests sea el mismo que el del inventario y no una cuenta paralela.
 */
const netoOrigen = (p, { cantidadInicial, transitoInicial }) => ({
  cantidad: cantidadInicial + p.ajusteOrigenUnidades,
  enTransito: transitoInicial - (p.tocaTransito ? p.enviadaUnidades : 0),
});

// ═══════════════════════════════════════════════════════════════════════════
// 1-3. LOS TRES CASOS DE UNA LÍNEA NORMAL
// ═══════════════════════════════════════════════════════════════════════════

test("1. 10 enviado / 10 recibido: el origen no se ajusta y el tránsito queda en 0", () => {
  const p = plan({ cantidad: 10, recibido: 10 });
  assert.equal(p.ok, true);
  assert.equal(p.hayDiferencia, false);
  assert.equal(p.recibidaUnidades, 10, "al destino entran 10");
  assert.equal(p.ajusteOrigenUnidades, 0);
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 10 }), {
    cantidad: 100,
    enTransito: 0,
  });
});

test("2. 10 enviado / 8 recibido: vuelven 2 al origen", () => {
  const p = plan({ cantidad: 10, recibido: 8 });
  assert.equal(p.ok, true);
  assert.equal(p.hayDiferencia, true);
  assert.equal(p.recibidaUnidades, 8);
  assert.equal(p.ajusteOrigenUnidades, 2);
  assert.equal(p.devolucionUnidades, 2);
  assert.equal(p.excedenteUnidades, 0);
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 10 }), {
    cantidad: 102,
    enTransito: 0,
  });
});

test("3. 10 enviado / 15 recibido: el origen pierde 5 MÁS, y el enviado no se toca", () => {
  const p = plan({ cantidad: 10, recibido: 15 });
  assert.equal(p.ok, true, "recibir de más ya no se rechaza");
  assert.equal(p.enviada, 10, "el remito sigue diciendo 10");
  assert.equal(p.recibida, 15);
  assert.equal(p.hayDiferencia, true);
  assert.equal(p.recibidaUnidades, 15, "al destino entran 15");
  assert.equal(p.ajusteOrigenUnidades, -5);
  assert.equal(p.devolucionUnidades, 0, "no vuelve nada");
  assert.equal(p.excedenteUnidades, 5);

  // El origen ya había perdido 10 al enviar; pierde 5 más al confirmar.
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 10 }), {
    cantidad: 95,
    enTransito: 0,
  });
});

test("3b. el enviado NUNCA se convierte en el recibido", () => {
  // Es la mitad que más importa del caso 3: si el sistema "arreglara" el remito,
  // la diferencia dejaría de existir y con ella la evidencia del desvío.
  for (const recibido of [0, 8, 10, 15, 1000]) {
    const p = plan({ cantidad: 10, recibido });
    assert.equal(p.enviada, 10, `con recibido ${recibido} el enviado sigue siendo 10`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 y 6. BULTOS: EL FACTOR SE APLICA UNA SOLA VEZ
// ═══════════════════════════════════════════════════════════════════════════

test("4. BULTO x20: 2 enviados / 3 recibidos → 40 físicas enviadas, 60 recibidas, -20 al origen", () => {
  const p = plan({ cantidad: 2, recibido: 3, unidad: "BULTO", factorPack: 20 });
  assert.equal(p.ok, true);
  assert.equal(p.enviadaUnidades, 40);
  assert.equal(p.recibidaUnidades, 60);
  assert.equal(p.ajusteOrigenUnidades, -20, "el ajuste adicional del origen");
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 40 }), {
    cantidad: 80,
    enTransito: 0,
  });
});

test("6. producto extra en BULTO: 0 enviados / 2 recibidos con factor 20 → -40", () => {
  const p = plan({ cantidad: 0, recibido: 2, unidad: "BULTO", factorPack: 20, agregado: true });
  assert.equal(p.ok, true);
  assert.equal(p.recibidaUnidades, 40, "al destino entran 40 físicas");
  assert.equal(p.ajusteOrigenUnidades, -40);
  assert.equal(p.tocaTransito, false);
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 0 }), {
    cantidad: 60,
    enTransito: 0,
  });
});

test("9. no hay doble conversión: el factor multiplica la RESTA, no cada término", () => {
  // (2 - 3) × 20 = -20. Si se hiciera (2×20) - (3×20) daría lo mismo acá, pero
  // con decimales de tres posiciones el segundo camino deja residuo binario.
  const p = plan({ cantidad: 2, recibido: 3, unidad: "BULTO", factorPack: 20 });
  assert.equal(p.ajusteOrigenUnidades, -20);

  const src = leerSinComentarios("lib/transferencias/recepcion.js");
  assert.ok(
    /\(envM - recM\)\s*\*\s*factorFisico/.test(src),
    "la resta va en milésimas enteras y el factor se aplica una sola vez"
  );

  // Y la ruta no vuelve a multiplicar por su cuenta.
  const ruta = leerSinComentarios(CONFIRMAR);
  assert.ok(!/factor_pack\s*\*/.test(ruta), "la ruta no hace aritmética física propia");
  assert.equal(
    (ruta.match(/aUnidadesFisicas/g) || []).length,
    0,
    "la conversión la hace el dominio, no la ruta"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. EL PRODUCTO QUE NO FIGURABA EN EL ENVÍO
// ═══════════════════════════════════════════════════════════════════════════

test("5. extra 0 enviado / 6 recibido: destino +6, origen -6, tránsito intacto", () => {
  const p = plan({ cantidad: 0, recibido: 6, agregado: true });
  assert.equal(p.ok, true);
  assert.equal(p.enviada, 0);
  assert.equal(p.recibida, 6);
  assert.equal(p.hayDiferencia, true);
  assert.equal(p.recibidaUnidades, 6);
  assert.equal(p.ajusteOrigenUnidades, -6);
  assert.equal(p.agregadoEnRecepcion, true);
  assert.equal(p.tocaTransito, false, "esa línea nunca formó parte del envío");

  const neto = netoOrigen(p, { cantidadInicial: 100, transitoInicial: 40 });
  assert.equal(neto.cantidad, 94);
  assert.equal(neto.enTransito, 40, "el tránsito de las OTRAS líneas no se toca");
});

test("5b. una línea agregada con envío es un error, no un caso", () => {
  const p = plan({ cantidad: 3, recibido: 6, agregado: true });
  assert.equal(p.ok, false);
  assert.equal(p.error, ERRORES_RECEPCION.AGREGADA_CON_ENVIO);
  assert.equal(p.ajusteOrigenUnidades, undefined, "no se calcula nada si no valida");
});

test("5c. una línea agregada sin recepción cargada no mueve nada", () => {
  const p = plan({ cantidad: 0, recibido: null, agregado: true });
  assert.equal(p.ok, true);
  assert.equal(p.recibidaUnidades, 0);
  assert.equal(p.ajusteOrigenUnidades, 0);
  assert.equal(accionAuditoriaDe(p), null, "sin movimiento no hay nada que auditar");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-8. LO QUE YA FUNCIONABA SIGUE FUNCIONANDO
// ═══════════════════════════════════════════════════════════════════════════

test("7. recibido 0 sigue devolviendo todo al origen", () => {
  const p = plan({ cantidad: 10, recibido: 0 });
  assert.equal(p.ok, true);
  assert.equal(p.recibidaUnidades, 0, "al destino no entra nada");
  assert.equal(p.ajusteOrigenUnidades, 10);
  assert.deepEqual(netoOrigen(p, { cantidadInicial: 100, transitoInicial: 10 }), {
    cantidad: 110,
    enTransito: 0,
  });
});

test("8. tres decimales sobreviven en los dos sentidos", () => {
  const falta = plan({ cantidad: 1.925, recibido: 1.7 });
  assert.equal(falta.ajusteOrigenUnidades, 0.225);
  assert.equal(aMilesimas(falta.ajusteOrigenUnidades), 225);

  const sobra = plan({ cantidad: 1.7, recibido: 1.925 });
  assert.equal(sobra.ajusteOrigenUnidades, -0.225);
  assert.equal(aMilesimas(sobra.ajusteOrigenUnidades), -225);
});

test("8b. la resta con signo tampoco deja residuo binario", () => {
  for (const [env, rec, esperado] of [
    [0.1, 0.3, -0.2],
    [1.004, 1.005, -0.001],
    [9.7, 10.1, -0.4],
  ]) {
    const a = calcularAjusteOrigenUnidades({ enviada: env, recibida: rec, unidad: "UNIDAD", factorPack: 1 });
    assert.equal(a, esperado, `${env} - ${rec} debe dar ${esperado} exacto`);
    assert.ok(aMilesimas(a) !== null, "el resultado cabe en Decimal(12,3)");
  }
});

test("19. una transferencia histórica normal da exactamente lo de siempre", () => {
  // Sin recepción cargada y sin la marca nueva: el default `false` no cambia nada.
  const p = validarDetalleRecepcion({
    detalle: { cantidad: 2, recibido: null, unidadEnviada: "BULTO", motivoPrincipal: null },
    factorPack: 20,
  });
  assert.equal(p.ok, true);
  assert.equal(p.recibidaUnidades, 40);
  assert.equal(p.enviadaUnidades, 40);
  assert.equal(p.ajusteOrigenUnidades, 0);
  assert.equal(p.agregadoEnRecepcion, false);
  assert.equal(p.tocaTransito, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA AUDITORÍA DISTINGUE LOS TRES CASOS
// ═══════════════════════════════════════════════════════════════════════════

test("la acción de auditoría separa faltante, excedente y agregado", () => {
  assert.equal(accionAuditoriaDe(plan({ cantidad: 10, recibido: 8 })), ACCIONES_RECEPCION.FALTANTE);
  assert.equal(accionAuditoriaDe(plan({ cantidad: 10, recibido: 15 })), ACCIONES_RECEPCION.EXCEDENTE);
  assert.equal(
    accionAuditoriaDe(plan({ cantidad: 0, recibido: 6, agregado: true })),
    ACCIONES_RECEPCION.AGREGADO
  );
  assert.equal(accionAuditoriaDe(plan({ cantidad: 10, recibido: 10 })), null);
});

test("una línea agregada se audita como AGREGADO y no como excedente", () => {
  // El orden de las preguntas importa: una línea agregada SIEMPRE produce
  // excedente —su envío es 0—, así que preguntando primero por el signo nunca se
  // registraría como agregada y se perdería la distinción.
  const p = plan({ cantidad: 0, recibido: 6, agregado: true });
  assert.equal(p.excedenteUnidades, 6, "efectivamente es un excedente");
  assert.equal(accionAuditoriaDe(p), ACCIONES_RECEPCION.AGREGADO, "y aun así se audita como agregado");
});

// ═══════════════════════════════════════════════════════════════════════════
// 10-18. LO QUE LAS RUTAS TIENEN QUE IMPEDIR
// ═══════════════════════════════════════════════════════════════════════════

test("11. solo el DESTINO puede recibir; el origen no", () => {
  const t = { origenId: 1, destinoId: 2 };
  assert.equal(puedeRecibir({ localId: 2 }, t).ok, true);
  assert.equal(puedeRecibir({ localId: 1 }, t).ok, false, "quien manda no cuenta lo que llegó");
  assert.equal(puedeRecibir({ localId: 3 }, t).status, 403);
  assert.equal(puedeRecibir({ localId: 0 }, t).status, 400, "sin local asignado");
  assert.equal(puedeRecibir({ esAdmin: true }, t).ok, true);
});

test("12-13. Recibida y Cancelada no son editables; Enviada y Recibiendo sí", () => {
  assert.equal(esEditableEnRecepcion("Enviada"), true);
  assert.equal(esEditableEnRecepcion("Recibiendo"), true);
  assert.equal(esEditableEnRecepcion("Recibida"), false);
  assert.equal(esEditableEnRecepcion("Cancelada"), false);
  assert.equal(esEditableEnRecepcion("Pendiente"), false);

  // Y "Recibida" contesta distinto de los demás, porque es el caso que la gente
  // vive: se confirmó y alguien vuelve a la pantalla vieja.
  assert.match(estadoAdmiteRecepcion("Recibida").error, /ya fue confirmada/i);
  assert.match(estadoAdmiteRecepcion("Cancelada").error, /Cancelada/);
});

test("las CUATRO rutas de recepción usan el mismo guard, no una copia cada una", () => {
  for (const ruta of [CONFIRMAR, GUARDAR, LINEA, BUSCAR]) {
    const src = leerSinComentarios(ruta);
    assert.ok(src.includes("estadoAdmiteRecepcion"), `${ruta} no comprueba el estado`);
    assert.ok(src.includes("puedeRecibir"), `${ruta} no comprueba el alcance`);
    assert.ok(
      !/localId\s*!==\s*transferencia\.destinoId/.test(src),
      `${ruta} tiene su propia copia de la regla de destino`
    );
  }
});

test("10. el producto extra se resuelve contra el catálogo del ORIGEN de esa transferencia", () => {
  const src = leerSinComentarios(LINEA);
  assert.ok(src.includes("productoDelCatalogoLocal"), "usa el filtro del buscador, no uno propio");
  assert.ok(
    /localId:\s*transferencia\.origenId/.test(src),
    "el origen sale de la transferencia persistida, nunca del request"
  );
  assert.ok(src.includes("PRODUCTO_FUERA_DEL_ORIGEN"));
  assert.ok(
    !/origenId\s*=\s*Number\(body/.test(src) && !/body\?\.origenId/.test(src),
    "el cliente no puede elegir el origen"
  );
});

test("10b. lo que no se puede buscar tampoco se puede agregar: el MISMO where", () => {
  const src = leerSinComentarios(BUSCADOR);
  assert.ok(src.includes("whereCatalogoLocal"), "hay un solo filtro de universo");
  assert.equal(
    (src.match(/whereCatalogoLocal\(/g) || []).length >= 3,
    true,
    "lo usan la búsqueda sin query, la búsqueda con query y la comprobación puntual"
  );
  assert.ok(src.includes("es_combo: false"), "los combos quedan afuera en un solo lugar");
  assert.ok(src.includes("productoVisibleWhere"), "y se respeta la visibilidad del local");
});

test("16-17. una línea agregada se puede borrar; una del remito no", () => {
  const src = leerSinComentarios(LINEA);
  assert.ok(/if\s*\(!detalle\.agregadoEnRecepcion\)/.test(src), "el guard tiene que existir");
  assert.ok(src.includes("LINEA_DEL_REMITO_NO_SE_BORRA"));
  // Y borrar no mueve stock: la línea nunca lo movió.
  for (const mutacion of ["stockLocal", "auditoriaStock", "$transaction"]) {
    assert.ok(!src.includes(mutacion), `agregar o borrar una línea no puede tocar ${mutacion}`);
  }
});

test("18. un producto que ya está en el remito no se duplica", () => {
  const src = leerSinComentarios(LINEA);
  assert.ok(
    /findFirst\(\{\s*where:\s*\{\s*transferenciaId:\s*transferencia\.id,\s*productoId:\s*producto\.id\s*\}/.test(src),
    "hay que buscar la línea existente antes de crear"
  );
  assert.ok(src.includes("yaExistia"), "y contestar cuál es, para que se aumente su recibido");
  const posBusqueda = src.indexOf("yaExistia: true");
  const posCreate = src.indexOf("transferenciaDetalle.create");
  assert.ok(posBusqueda > 0 && posCreate > 0 && posBusqueda < posCreate);
});

test("el buscador de recepción NO reusa el del POS, y no copia su búsqueda", () => {
  const src = leerSinComentarios(BUSCAR);
  assert.ok(src.includes('checkPerm(session, "transferencias.recibir")'), "otro permiso");
  assert.ok(src.includes("buscarCatalogoLocal"), "la búsqueda es la MISMA pieza");
  assert.ok(
    /localId:\s*transferencia\.origenId/.test(src),
    "el catálogo es el del origen de esa transferencia"
  );
  assert.ok(
    !src.includes("rankearLiteral") && !src.includes("productoVisibleWhere"),
    "no hay un segundo buscador escrito al lado"
  );

  // Y el del POS quedó usando la misma pieza: si fueran dos, se separarían.
  const pos = leerSinComentarios(POS_BUSCAR);
  assert.ok(pos.includes("buscarCatalogoLocal"));
  assert.ok(!pos.includes("rankearLiteral"), "el POS ya no tiene su propia copia");
  assert.ok(
    /origenId\s*!==\s*Number\(session\.localId\)/.test(pos),
    "y conserva SU autorización, que es la que no se podía compartir"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 14-15 y 20. LA CONFIRMACIÓN SIGUE SIENDO ATÓMICA Y SOLO DE INVENTARIO
// ═══════════════════════════════════════════════════════════════════════════

test("14-15. una sola transacción y la barrera de doble confirmación intacta", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.equal((src.match(/prisma\.\$transaction/g) || []).length, 1);
  assert.ok(src.includes("ALREADY_CONFIRMED"));
  const posLock = src.indexOf("lock.count === 0");
  for (const mutacion of ["stockLocal.update(", "stockLocal.upsert", "auditoriaStock.create"]) {
    assert.ok(posLock < src.indexOf(mutacion), `la barrera debe cortar antes de ${mutacion}`);
  }
});

test("20. la recepción sigue sin tocar Venta, caja, pagos ni puntos", () => {
  for (const ruta of [CONFIRMAR, GUARDAR, LINEA]) {
    const src = leerSinComentarios(ruta);
    for (const tabla of [
      "venta.update",
      "venta.create",
      "ventaDetalle",
      "ventaPago",
      "movimientoCuenta",
      "cajaMovimiento",
      "puntos",
    ]) {
      assert.ok(!src.includes(tabla), `${ruta} no puede tocar ${tabla}`);
    }
  }
});

test("la política de stock negativo es la VIGENTE, no una nueva", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(src.includes("getConfigLocalEfectiva"), "se lee la configuración efectiva del origen");
  assert.ok(src.includes("allowNegativeStock"), "el mismo flag que usa el envío");
  assert.ok(src.includes("STOCK_INSUFICIENTE"), "y el mismo código de error");
  // Y se comprueba ANTES de abrir la transacción: si no alcanza, no se empieza.
  const posChequeo = src.indexOf("allowNegativeStock");
  const posTx = src.indexOf("prisma.$transaction");
  assert.ok(posChequeo > 0 && posChequeo < posTx, "el chequeo va antes de tocar stock");
});
