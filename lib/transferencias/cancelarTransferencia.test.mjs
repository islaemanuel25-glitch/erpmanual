// Candados de CANCELAR UNA TRANSFERENCIA desde el módulo Transferencias.
//
// El caso de referencia es real: transferencia #97 hacia Casiano casas, nacida de
// la venta 7726 (ticket #1022) por $155.486,40. Casiano la abre, ve que no le
// corresponde y tiene que poder deshacerla desde ahí.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  puedeCancelarTransferencia,
  participaDeLaTransferencia,
  tieneRecepcionCargada,
  resumenDeLaCancelacion,
  CODIGOS_CANCELAR,
} from "./cancelarTransferencia.js";
import {
  esOperativa,
  soloOperativas,
  resumenPorEstado,
  agruparPorDestino,
  productosMasTransferidos,
  importeDeDetalleCentavos,
  desdeCentavos,
  ESTADOS_NO_OPERATIVOS,
} from "./agregadosPeriodo.js";
import { deltaDeDevolucion } from "../pos-ventas/reversionVenta.js";
import { reversionStockOrigen } from "./politicasStock.js";
import { validarMotivoDiferencia } from "./recepcion.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const MOTIVO = "El remito salio al local equivocado.";

const DEPOSITO = 1;
const CASIANO = 4;
const OTRO = 2;

// Las cinco líneas de la #97, sin recepción.
const LINEAS = [
  { id: 2684, cantidad: 3.62, recibido: null, unidadEnviada: "UNIDAD" },
  { id: 2686, cantidad: 2, recibido: null, unidadEnviada: "UNIDAD" },
];

const VENTA_7726 = {
  id: 7726,
  numero: 1022,
  total: 155486.4,
  anuladaEn: null,
  localId: DEPOSITO,
  turnoId: 264,
  turno: { id: 264, cierre: null },
  version: 0,
};

const T97 = {
  id: 97,
  estado: "Enviada",
  origenId: DEPOSITO,
  destinoId: CASIANO,
  detalle: LINEAS,
  venta: VENTA_7726,
};

const TURNO = { id: 264 };

// ── 1 · EL DESTINO PUEDE, QUE ERA LO QUE FALTABA ────────────────────────────

test("1. el DESTINO puede cancelar — era el 403 que contradecía al botón", () => {
  // La pantalla mostraba el botón a cualquiera con el permiso y el backend
  // exigía ser el origen. El local que RECIBE el remito es justamente quien
  // descubre que no le corresponde.
  const v = puedeCancelarTransferencia({
    transferencia: T97,
    localId: CASIANO,
    motivo: MOTIVO,
    turnoAbierto: TURNO,
  });
  assert.equal(v.puede, true, "el destino tiene que poder cancelar");
  assert.equal(v.revierteVenta, true);
  assert.equal(v.ventaId, 7726);
});

test("1b. el ORIGEN también, y un tercero NO", () => {
  assert.equal(
    puedeCancelarTransferencia({ transferencia: T97, localId: DEPOSITO, motivo: MOTIVO, turnoAbierto: TURNO }).puede,
    true
  );
  const ajeno = puedeCancelarTransferencia({
    transferencia: T97,
    localId: OTRO,
    motivo: MOTIVO,
    turnoAbierto: TURNO,
  });
  assert.equal(ajeno.codigo, CODIGOS_CANCELAR.FUERA_DE_ALCANCE);
});

test("1c. participaDeLaTransferencia mira las DOS puntas", () => {
  assert.equal(participaDeLaTransferencia(T97, DEPOSITO), true);
  assert.equal(participaDeLaTransferencia(T97, CASIANO), true);
  assert.equal(participaDeLaTransferencia(T97, OTRO), false);
  assert.equal(participaDeLaTransferencia(T97, null), false);
  assert.equal(participaDeLaTransferencia(T97, 0), false);
});

test("1d. y el admin sin local pasa igual", () => {
  const v = puedeCancelarTransferencia({
    transferencia: T97,
    localId: null,
    esAdmin: true,
    motivo: MOTIVO,
    turnoAbierto: TURNO,
  });
  assert.equal(v.puede, true);
});

// ── 2 · LA POLÍTICA, Y LA DOBLE DEVOLUCIÓN QUE HAY QUE EVITAR ───────────────

test("2. NO se devuelve el stock dos veces cuando hay venta vinculada", () => {
  // Éste es el candado central de la reversión. El remito nació con
  // SOLO_TRANSITO —la venta descontó `cantidad`, la transferencia solo marcó el
  // viaje—, así que al cancelar:
  //
  //   · la reversión del remito baja SOLO el tránsito;
  //   · la reversión de la venta devuelve `cantidad`, una vez.
  //
  // Si las dos devolvieran `cantidad`, el origen recuperaría la mercadería dos
  // veces. Se comprueba el álgebra sobre un saldo, sumando los dos efectos.
  const aplicar = (saldo, frag) => ({
    cantidad: saldo.cantidad + (frag.cantidad?.increment ?? 0) - (frag.cantidad?.decrement ?? 0),
    enTransito: saldo.enTransito + (frag.enTransito?.increment ?? 0) - (frag.enTransito?.decrement ?? 0),
  });

  // Punto de partida: la venta ya descontó 10 y el remito marcó 10 en tránsito.
  const antesDeCancelar = { cantidad: 90, enTransito: 10 };

  // 1) La reversión del remito, con la política con la que nació.
  const trasRemito = aplicar(antesDeCancelar, reversionStockOrigen("SOLO_TRANSITO", 10).update);
  assert.deepEqual(trasRemito, { cantidad: 90, enTransito: 0 },
    "el remito no debe devolver cantidad: solo libera el tránsito");

  // 2) La reversión de la venta, que es la que devuelve la mercadería.
  const delta = deltaDeDevolucion([{ productoLocalId: 7, cantidadStock: 10, componentes: [] }]);
  assert.deepEqual(delta, [{ productoLocalId: 7, delta: 10 }]);
  const trasVenta = { cantidad: trasRemito.cantidad + delta[0].delta, enTransito: trasRemito.enTransito };

  assert.deepEqual(trasVenta, { cantidad: 100, enTransito: 0 },
    "el neto tiene que ser el stock original: ni inventado ni devuelto dos veces");
});

test("2b. un remito MANUAL sí devuelve la cantidad, porque nadie más lo hace", () => {
  const { update } = reversionStockOrigen("DESCONTAR_Y_TRANSITO", 10);
  assert.deepEqual(update, { cantidad: { increment: 10 }, enTransito: { decrement: 10 } });
});

// ── 3 · LO QUE BLOQUEA ──────────────────────────────────────────────────────

test("3. una línea con recepción cargada bloquea — y 0 recibido ES recepción", () => {
  assert.equal(tieneRecepcionCargada(LINEAS), false);
  assert.equal(tieneRecepcionCargada([{ recibido: 0 }]), true);
  assert.equal(tieneRecepcionCargada([{ recibido: 5 }]), true);
  assert.equal(tieneRecepcionCargada([{ recibido: undefined }]), false);

  const conCero = [LINEAS[0], { ...LINEAS[1], recibido: 0 }];
  const v = puedeCancelarTransferencia({
    transferencia: { ...T97, detalle: conCero },
    localId: CASIANO,
    motivo: MOTIVO,
    turnoAbierto: TURNO,
  });
  assert.equal(v.codigo, CODIGOS_CANCELAR.CON_RECEPCION);
  // Y el mensaje tiene que enseñar el camino correcto, no solo negar.
  assert.match(v.error, /recibido 0.*motivo/i);
});

test("3b. solo en estado Enviada", () => {
  for (const estado of ["Recibiendo", "Recibida", "Cancelada", "Pendiente"]) {
    const v = puedeCancelarTransferencia({
      transferencia: { ...T97, estado },
      localId: CASIANO,
      motivo: MOTIVO,
      turnoAbierto: TURNO,
    });
    assert.equal(v.codigo, CODIGOS_CANCELAR.ESTADO_INVALIDO, estado);
  }
});

test("3c. el motivo es OBLIGATORIO — y eso es todo lo que se exige", () => {
  // ── ESTE CANDADO PROTEGÍA UN NÚMERO INVENTADO ─────────────────────────────
  //
  // Exigía 10 caracteres, un mínimo que no salió de ninguna decisión de negocio:
  // lo había puesto yo. Se sacó el 2026-08-20. La regla aprobada es "toda
  // cancelación requiere motivo", nada más, y un largo mínimo ni siquiera
  // consigue lo que aparenta — rechaza "se rompio" y acepta "aaaaaaaaaa".
  //
  // Lo que se exige ahora: que exista y que no quede vacío al recortar espacios.
  const rechaza = (motivo) =>
    puedeCancelarTransferencia({ transferencia: T97, localId: CASIANO, motivo, turnoAbierto: TURNO }).codigo;
  const acepta = (motivo) =>
    puedeCancelarTransferencia({ transferencia: T97, localId: CASIANO, motivo, turnoAbierto: TURNO }).puede;

  // Vacío, espacios, o algo que no es texto: se rechaza.
  for (const motivo of ["", "   ", "\t\n ", null, undefined, 7, {}]) {
    assert.equal(rechaza(motivo), CODIGOS_CANCELAR.MOTIVO_AUSENTE, JSON.stringify(motivo));
  }

  // Y un motivo corto pero real SE ACEPTA. Ésta es la mitad que importa: si
  // alguien reintroduce un mínimo, esto se pone rojo.
  for (const motivo of ["error", "ok", "x", "se rompio", "no era para acá"]) {
    assert.equal(acepta(motivo), true, `"${motivo}" es un motivo válido: no hay largo mínimo`);
  }
});

test("3c-bis. el motivo se conserva ÍNTEGRO, sin truncar", () => {
  // Auditoría: lo que el operador escribió tiene que quedar guardado entero. El
  // predicado no lo recorta ni lo modifica; solo valida.
  const largo = "Se envio al local equivocado por un error de carga en el POS: " +
    "el cliente elegido fue Minimarket Casiano cuando la mercaderia era para Ayala.";
  const v = puedeCancelarTransferencia({
    transferencia: T97,
    localId: CASIANO,
    motivo: largo,
    turnoAbierto: TURNO,
  });
  assert.equal(v.puede, true);

  // Y la ruta guarda el motivo tal cual lo recibe, sin `slice` ni `substring`.
  const src = leer("app/api/transferencias/cancelar/route.js");
  assert.match(src, /motivoCancelacion: motivo/);
  assert.ok(!/motivo\.(slice|substring|substr)/.test(src), "la ruta trunca el motivo");
});

test("3d. con venta vinculada hace falta una caja abierta donde imputar", () => {
  const v = puedeCancelarTransferencia({
    transferencia: T97,
    localId: CASIANO,
    motivo: MOTIVO,
    turnoAbierto: null,
  });
  assert.equal(v.codigo, CODIGOS_CANCELAR.SIN_TURNO_DESTINO);

  // Sin venta, no hace falta: no hay plata que imputar.
  const manual = puedeCancelarTransferencia({
    transferencia: { ...T97, venta: null },
    localId: CASIANO,
    motivo: MOTIVO,
    turnoAbierto: null,
  });
  assert.equal(manual.puede, true);
  assert.equal(manual.revierteVenta, false);
});

test("3e. una venta ya anulada no se anula de nuevo", () => {
  const v = puedeCancelarTransferencia({
    transferencia: { ...T97, venta: { ...VENTA_7726, anuladaEn: new Date() } },
    localId: CASIANO,
    motivo: MOTIVO,
    turnoAbierto: TURNO,
  });
  assert.equal(v.codigo, CODIGOS_CANCELAR.ESTADO_INVALIDO);
});

// ── 4 · EL RESUMEN QUE SE LE MUESTRA AL USUARIO ─────────────────────────────

test("4. el resumen dice la verdad según el remito tenga venta o no", () => {
  const conVenta = resumenDeLaCancelacion(T97);
  assert.equal(conVenta.revierteVenta, true);
  // Se busca "anula" y no la palabra "venta": cómo se nombra el comprobante lo
  // fija el candado 4b, y atarlo también acá haría que un cambio de palabra
  // ponga dos candados en rojo por el mismo motivo.
  assert.ok(conVenta.efectos.some((e) => /se anula/i.test(e)));
  assert.ok(conVenta.efectos.some((e) => /una sola vez/i.test(e)),
    "tiene que decir que el stock vuelve UNA vez");

  const manual = resumenDeLaCancelacion({ ...T97, venta: null });
  assert.equal(manual.revierteVenta, false);
  assert.ok(!manual.efectos.some((e) => /se anula/i.test(e)),
    "un remito manual no anula ningún comprobante");

  // Las dos versiones dicen que las líneas siguen visibles: es la promesa de
  // trazabilidad y no puede depender del caso.
  for (const r of [conVenta, manual]) {
    assert.ok(r.efectos.some((e) => /siguen visibles/i.test(e)));
  }
});

test("4b. al comprobante se lo llama TICKET, que es el número que el operador ve", () => {
  // ── NOMENCLATURA, Y NO ES UN DETALLE DE REDACCIÓN ─────────────────────────
  //
  // `Venta.numero` es el número de COMPROBANTE y el ERP lo muestra como
  // "Ticket": así aparece en el listado de ventas y en el ticket impreso. El
  // identificador interno de la venta es `id`, y son dos cosas distintas — la
  // venta 7726 lleva el ticket 1022.
  //
  // El panel decía "se anula la venta #1022", que es llamar venta al número de
  // ticket. Quien lo lea va a buscar la venta 1022, que existe y es otra.
  const conVenta = resumenDeLaCancelacion(T97);
  const linea = conVenta.efectos.find((e) => /ticket/i.test(e));
  assert.ok(linea, "el resumen no nombra el ticket");
  assert.match(linea, /ticket #1022/i, "tiene que usar el NÚMERO de comprobante");
  assert.ok(
    !conVenta.efectos.some((e) => /venta #1022|venta #\d/i.test(e)),
    "llama 'venta #N' al número de ticket: son cosas distintas"
  );

  // Y el panel de la pantalla usa la misma palabra.
  const panel = leer("components/transferencias/PanelCancelarTransferencia.jsx");
  assert.match(panel, /Se anula el ticket #\{preview\.venta\.numero\}/,
    "el panel volvió a llamar 'venta' al número de ticket");
});

// ── 5 · LAS CANCELADAS NO SUMAN AL MOVIMIENTO OPERATIVO ─────────────────────

const linea = (cant, costo) => ({
  cantidad: cant,
  recibido: null,
  unidadEnviada: "UNIDAD",
  precioCosto: costo,
  productoId: 1,
  producto: { precio_costo: costo, nombre: "P", base: { unidad_medida: "unidad", factor_pack: 1, nombre: "P" } },
});
const tr = (id, estado, cant) => ({
  id,
  estado,
  tieneDiferencias: false,
  destinoId: CASIANO,
  destino: { id: CASIANO, nombre: "Casiano casas" },
  origen: { id: DEPOSITO, nombre: "depo", es_deposito: true },
  fechaEnvio: "2026-08-19T12:00:00.000Z",
  createdAt: "2026-08-19T12:00:00.000Z",
  detalle: [linea(cant, 100)],
});

test("5. esOperativa excluye Cancelada y Cancelando, y nada más", () => {
  assert.equal(esOperativa({ estado: "Enviada" }), true);
  assert.equal(esOperativa({ estado: "Recibida" }), true);
  assert.equal(esOperativa({ estado: "Recibiendo" }), true);
  assert.equal(esOperativa({ estado: "Cancelada" }), false);
  // "Cancelando" es el estado intermedio de la barrera atómica: tampoco movió nada.
  assert.equal(esOperativa({ estado: "Cancelando" }), false);
  assert.deepEqual(ESTADOS_NO_OPERATIVOS, ["Cancelada", "Cancelando"]);
});

test("5b. el importe del período NO suma las canceladas", () => {
  const periodo = [tr(1, "Enviada", 10), tr(2, "Cancelada", 10), tr(3, "Recibida", 5)];
  const operativas = soloOperativas(periodo);
  assert.equal(operativas.length, 2);

  const total = desdeCentavos(
    operativas.reduce((a, t) => a + importeDeDetalleCentavos(t.detalle, { origenEsDeposito: true }), 0)
  );
  assert.equal(total, 1500, "10×100 + 5×100; la cancelada de 10×100 no entra");
});

test("5c. el agrupado por destino tampoco", () => {
  const periodo = [tr(1, "Enviada", 10), tr(2, "Cancelada", 10)];
  const [grupo] = agruparPorDestino(soloOperativas(periodo));
  assert.equal(grupo.cantidadTransferencias, 1);
  assert.equal(grupo.importeTotal, 1000);
});

test("5d. los productos más transferidos tampoco", () => {
  const periodo = [tr(1, "Enviada", 10), tr(2, "Cancelada", 10)];
  const productos = productosMasTransferidos(soloOperativas(periodo));
  assert.equal(productos.length, 1);
  assert.equal(productos[0].importeTransferido, 1000);
  assert.equal(productos[0].cantidadEnviada, 10, "la cancelada no aporta cantidad");
});

test("5e. PERO el desglose por estado SÍ las muestra, marcadas", () => {
  // "Cuántas se cancelaron" es justamente lo que este bloque contesta. La fila
  // aparece, con su cantidad y su importe original, y `esOperativo` en false para
  // que ningún total la sume. Poner el importe en cero habría borrado el dato de
  // cuánto valía lo cancelado.
  const periodo = [tr(1, "Enviada", 10), tr(2, "Cancelada", 10)];
  const desglose = resumenPorEstado(periodo);

  const cancelada = desglose.find((f) => f.estado === "Cancelada");
  assert.ok(cancelada, "la fila Cancelada tiene que seguir apareciendo en el historial");
  assert.equal(cancelada.cantidadTransferencias, 1);
  assert.equal(cancelada.importeTotal, 1000, "el importe original se conserva, no se pone en cero");
  assert.equal(cancelada.esOperativo, false);

  const enviada = desglose.find((f) => f.estado === "Enviada");
  assert.equal(enviada.esOperativo, true);

  // Y el total operativo se puede reconstruir desde el desglose sin ambigüedad.
  const totalOperativo = desglose.filter((f) => f.esOperativo).reduce((a, f) => a + f.importeTotal, 0);
  assert.equal(totalOperativo, 1000);
});

// ── 6 · LAS RUTAS ───────────────────────────────────────────────────────────

const leer = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("6. TODAS las superficies del barrido excluyen las canceladas", () => {
  // No alcanza con arreglar una tarjeta si otro total sigue sumando. Se enumeran
  // las dos rutas que consumen el mismo barrido.
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = leer(rel);
    assert.match(src, /soloOperativas\(/, `${rel} no filtra las canceladas del movimiento`);
  }

  // Y en el listado, los tres agregados de movimiento salen del periodo filtrado.
  const listado = leer("app/api/transferencias/listar/route.js");
  assert.match(listado, /const periodoOperativo = soloOperativas\(periodo\)/);
  assert.match(listado, /periodoOperativo\.reduce/, "el importe global sigue sumando todo");
  assert.match(listado, /productosMasTransferidos\(periodoOperativo/, "los productos siguen sumando canceladas");
  // El desglose por estado usa el período COMPLETO a propósito.
  assert.match(listado, /resumenPorEstado\(periodo\)/,
    "el desglose por estado dejó de ver las canceladas: ya no puede informar cuántas hubo");
});

test("7. la ruta de cancelar reusa el motor de ventas y NO escribe uno nuevo", () => {
  const src = leer("app/api/transferencias/cancelar/route.js");
  assert.match(src, /revertirVenta/, "la ruta no reusa el motor de reversión de ventas");
  assert.match(src, /reversionStockOrigen/, "la reversión del tránsito no sale de la pieza única");
  assert.match(src, /politicaDeLaTransferencia\(t\)/, "la política se fijó a mano en vez de derivarse");
  // Nada de reimplementar la reversión de puntos ni de cuenta corriente acá.
  for (const propio of ["clientePuntoMovimiento", "movimientoCuenta.create"]) {
    assert.ok(!src.includes(propio), `la ruta reimplementa ${propio}: eso lo hace el motor`);
  }
});

test("8. la cancelación es atómica y deja rastro de quién, cuándo y por qué", () => {
  const src = leer("app/api/transferencias/cancelar/route.js");
  assert.match(src, /\$transaction/);
  assert.match(src, /lock\.count === 0/, "falta la barrera atómica contra una recepción concurrente");

  // El rastro, que antes no existía: el código decía que usaba `updatedAt`.
  assert.match(src, /canceladaEn: new Date\(\)/);
  assert.match(src, /canceladaPorId: auth\.session\.id/);
  assert.match(src, /motivoCancelacion: motivo/);

  // Y el orden: la barrera antes de tocar stock, la venta antes de cerrar el
  // remito. Si perdimos la carrera con una recepción, no se tocó nada.
  const posBarrera = src.indexOf('estado: "Enviada"');
  const posStock = src.indexOf("reversionStockOrigen(politica");
  const posCierre = src.indexOf('estado: "Cancelada"');
  assert.ok(posBarrera > 0 && posBarrera < posStock, "la barrera tiene que ir antes del stock");
  assert.ok(posStock < posCierre, "el remito se cierra al final");
});

test("9. NO se borra nada: ni la transferencia, ni sus líneas, ni la venta", () => {
  const src = leer("app/api/transferencias/cancelar/route.js");
  for (const prohibido of [
    "transferencia.delete",
    "transferenciaDetalle.delete",
    "venta.delete",
    "ventaDetalle.delete",
    "deleteMany",
  ]) {
    assert.ok(!src.includes(prohibido), `la ruta usa ${prohibido}: ERP Azul no borra la historia`);
  }
});

test("10. el modelo tiene los campos de auditoría, y no son `updatedAt`", () => {
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const modelo = schema.match(/model Transferencia \{[\s\S]*?\n\}/)[0].replace(/\/\/[^\n]*/g, "");
  assert.match(modelo, /canceladaEn\s+DateTime\?/);
  assert.match(modelo, /canceladaPorId\s+Int\?/);
  assert.match(modelo, /motivoCancelacion\s+String\?/);
  // Sin booleano en paralelo: el estado se deriva de la fecha.
  assert.ok(!/\bcancelada\s+Boolean/.test(modelo), "apareció un booleano `cancelada` junto a la fecha");
});

// ── 11 · VENTAS DEJÓ DE SER EL CAMINO ───────────────────────────────────────

test("11. Ventas ya NO tiene botón de anular ni interruptor de internas", () => {
  // La decisión de producto: una transferencia se corrige desde Transferencias.
  // Si esto se pone rojo es porque volvió el segundo camino operativo.
  const acciones = leer("components/reportes-ventas/AccionesTicket.jsx");
  assert.ok(!/Anular venta/.test(acciones), "volvió el botón de anular en Ventas");
  assert.ok(!/PanelAnularVenta/.test(acciones), "volvió el panel de anular en Ventas");

  const pantalla = leer("app/modulos/reportes-ventas/page.jsx");
  assert.ok(!/incluirInternas/.test(pantalla), "volvió el interruptor de ver internas");
  assert.ok(!/verInternas/.test(pantalla), "volvió el estado del interruptor");

  const listado = leer("app/api/reportes-ventas/listado/route.js");
  assert.ok(!/incluirInternas/.test(listado),
    "el listado comercial volvió a poder mezclar operaciones internas");

  assert.ok(
    !fs.existsSync(path.join(RAIZ, "app/api/pos-ventas/venta/[id]/anular/route.js")),
    "volvió la ruta de anular venta desde Ventas"
  );
});

// ── 12 · UN PRODUCTO QUE NO LLEGÓ NO SE BORRA DEL REMITO ────────────────────

test("12. NINGUNA ruta de transferencias borra una línea de detalle", () => {
  // La regla de trazabilidad: si se enviaron 1 y llegaron 0, la línea queda con
  // enviado 1, recibido 0, diferencia -1 y su motivo. Nunca se elimina para que
  // parezca que el producto no estuvo en el remito.
  //
  // Se enumeran TODAS las rutas del módulo, no las que uno recuerda: el día que
  // alguien agregue un "quitar producto" que borre, esto se pone rojo.
  const rutas = fs
    .readdirSync(path.join(RAIZ, "app/api/transferencias"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `app/api/transferencias/${d.name}/route.js`)
    .filter((rel) => fs.existsSync(path.join(RAIZ, rel)));

  assert.ok(rutas.length >= 8, `se esperaban al menos 8 rutas, se enumeraron ${rutas.length}`);

  for (const rel of rutas) {
    const src = leer(rel);
    assert.ok(
      !/transferenciaDetalle\.(delete|deleteMany)/.test(src),
      `${rel} borra líneas de detalle: un producto que no llegó se registra con recibido 0, no se elimina`
    );
  }
});

test("12b. y la recepción exige motivo cuando lo recibido difiere de lo enviado", () => {
  // El par del anterior: no alcanza con no borrar si la diferencia puede quedar
  // sin explicación. `recibido: 0` es el caso extremo y también lo exige.
  const sinMotivo = validarMotivoDiferencia({ hayDiferencia: true, motivoPrincipal: "" });
  assert.equal(sinMotivo.ok, false);

  const conMotivo = validarMotivoDiferencia({ hayDiferencia: true, motivoPrincipal: "Faltante" });
  assert.equal(conMotivo.ok, true);

  // "Otro" sin detalle tampoco alcanza.
  assert.equal(
    validarMotivoDiferencia({ hayDiferencia: true, motivoPrincipal: "Otro", motivoDetalle: "" }).ok,
    false
  );

  // Y sin diferencia no se pide nada.
  assert.equal(validarMotivoDiferencia({ hayDiferencia: false }).ok, true);
});

test("11b. pero el MOTOR de reversión sigue existiendo y se usa", () => {
  // El par del anterior. Sacar la UI no puede llevarse el motor: es lo que hace
  // que la cancelación desde Transferencias sea correcta.
  assert.ok(fs.existsSync(path.join(RAIZ, "lib/pos-ventas/reversionVenta.js")));
  const cancelar = leer("app/api/transferencias/cancelar/route.js");
  assert.match(cancelar, /from "@\/lib\/pos-ventas\/reversionVenta"/);
});
