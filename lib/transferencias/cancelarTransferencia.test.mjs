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
  ordenarDestinos,
  totalesDeDestinos,
  ESTADOS_NO_OPERATIVOS,
} from "./agregadosPeriodo.js";
import { deltaDeDevolucion, impactoEnArqueo } from "../pos-ventas/reversionVenta.js";
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

test("3d. SIN CAJA ABIERTA se puede cancelar igual — no hay plata que imputar", () => {
  // ── ESTE CANDADO AFIRMABA LO CONTRARIO, Y ERA UNA EXIGENCIA HEREDADA ──────
  //
  // Pedía un turno abierto en el local vendedor, copiado del flujo de anular una
  // venta común. Ahí sí hace falta: esa anulación baja el esperado del arqueo y
  // la diferencia tiene que caer en alguna caja.
  //
  // Una venta con remito nunca contó para el arqueo, así que revertirla no
  // genera ninguna diferencia. Pedir la caja abierta significaba que el depósito
  // tuviera que abrir la suya para que Casiano pudiera deshacer un remito que le
  // llegó por error.
  //
  // Comprobado sobre las piezas antes de sacarlo: ni `aplicarDeltaStock`, ni
  // `ajustarCuentaCorriente`, ni `ajustarPuntosCorreccion` miran el turno, y
  // `VentaCorreccion.turnoIdCorreccion` es nullable.
  const v = puedeCancelarTransferencia({
    transferencia: T97,
    localId: CASIANO,
    motivo: MOTIVO,
  });
  assert.equal(v.puede, true, "el destino tiene que poder cancelar sin caja abierta");
  assert.equal(v.revierteVenta, true);

  // Y el predicado ya no recibe ni mira ningún turno.
  const src = leer("lib/transferencias/cancelarTransferencia.js");
  assert.ok(!/turnoAbierto/.test(src), "el predicado volvió a mirar el turno");
  assert.ok(!/SIN_TURNO_DESTINO:/.test(src), "volvió el código de bloqueo por turno");

  // Ni la ruta lo busca.
  const ruta = leer("app/api/transferencias/cancelar/route.js");
  assert.ok(!/turnoAbiertoDe|WHERE_TURNO_OPERATIVO/.test(ruta),
    "la ruta volvió a buscar una caja abierta");
});

test("3d-bis. el impacto de arqueo es CERO y el turno de corrección queda null", () => {
  // Las tres propiedades que hacen que sacar la exigencia sea seguro, juntas.
  //
  // 1) Una venta con remito no contaba para el esperado, así que revertirla no
  //    lo mueve. Ése es el hecho del que cuelga todo lo demás.
  const impacto = impactoEnArqueo({
    transferencia: { id: 97 },
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 155486.4 }],
  });
  assert.equal(impacto.contabaEnArqueo, false);
  assert.equal(impacto.deltaEsperado, 0, "una venta con remito no puede mover el arqueo");
  assert.deepEqual(impacto.medios, []);

  // 2) La ruta le pasa la transferencia al motor. Sin ese dato el motor trataría
  //    la venta como común y registraría un delta que no existe.
  const ruta = leer("app/api/transferencias/cancelar/route.js");
  assert.match(ruta, /venta: \{ \.\.\.t\.venta, transferencia: \{ id: t\.id \} \}/,
    "el motor no recibe la transferencia: calcularía un impacto de caja falso");

  // 3) Y `turnoIdCorreccion` va null: poner un turno diría que la diferencia
  //    impactó en esa caja, y no impactó nada.
  assert.match(ruta, /turnoDestinoId: null/,
    "la ruta volvió a imputar la reversión a una caja");
});

test("3d-ter. sin venta vinculada tampoco hace falta nada de eso", () => {
  const manual = puedeCancelarTransferencia({
    transferencia: { ...T97, venta: null },
    localId: CASIANO,
    motivo: MOTIVO,
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

// ── 5f-5m · DOCUMENTO vs MOVIMIENTO EN "POR DESTINO" ────────────────────────
//
// El defecto: la ruta llamaba `agruparPorDestino(soloOperativas(periodo))`, o sea
// filtraba ANTES de agrupar. Con eso el importe salía bien y el documento
// desaparecía — el 19/08 el resumen general decía 7 transferencias y la pestaña
// mostraba 6, con la #97 fuera del grupo de Casiano.
//
// Filtrar antes de agrupar hace que "no suma" y "no existe" sean lo mismo.

/** Un período como el del 19/08: varias operativas y una cancelada. */
const periodo19 = () => [
  tr(98, "Enviada", 10),
  tr(99, "Enviada", 10),
  tr(100, "Enviada", 10),
  tr(97, "Cancelada", 10),
];

test("5f. un período con 6 operativas + 1 cancelada da 7 documentos y 6 operativas", () => {
  const periodo = [
    ...Array.from({ length: 6 }, (_, i) => tr(200 + i, "Enviada", 10)),
    tr(97, "Cancelada", 10),
  ];
  assert.equal(periodo.length, 7, "historial");
  assert.equal(soloOperativas(periodo).length, 6, "operativo");

  // Y el agrupado, que es donde se rompía, tiene que decir lo mismo.
  const grupos = agruparPorDestino(periodo);
  const documentos = grupos.reduce((a, g) => a + g.cantidadTransferencias, 0);
  assert.equal(documentos, 7, "la pestaña Por destino perdió documentos al agrupar");
  assert.equal(totalesDeDestinos(grupos).transferencias, 7);
  assert.equal(totalesDeDestinos(grupos).canceladas, 1);
});

test("5g. un destino con 3 operativas y 1 cancelada devuelve las CUATRO filas", () => {
  const [grupo] = agruparPorDestino(periodo19());
  assert.equal(grupo.transferencias.length, 4, "la cancelada desapareció del sublistado");
  assert.deepEqual(
    grupo.transferencias.map((t) => t.id).sort((a, b) => a - b),
    [97, 98, 99, 100]
  );
  assert.equal(grupo.cantidadTransferencias, 4, "el conteo de documentos no incluye la cancelada");
  assert.equal(grupo.cantidadCanceladas, 1);
});

test("5h. la cancelada conserva su importe histórico y NO lo suma al total", () => {
  const [grupo] = agruparPorDestino(periodo19());
  const cancelada = grupo.transferencias.find((t) => t.estado === "Cancelada");

  assert.equal(cancelada.totalCosto, 1000, "la fila perdió el importe original del remito");
  assert.equal(cancelada.esOperativa, false, "la fila no está marcada, la pantalla no puede avisarlo");

  // Tres operativas × 10 × 100 = 3000. La cancelada vale 1000 y no entra.
  assert.equal(grupo.importeTotal, 3000, "el importe del grupo suma la cancelada");
  assert.equal(totalesDeDestinos([grupo]).importeTotal, 3000);

  // Y los ítems son operativos: la cancelada no aporta líneas.
  assert.equal(grupo.cantidadItems, 3, "los ítems operativos incluyen los de la cancelada");
});

test("5i. con Estado=Cancelada la vista NO queda vacía", () => {
  // Éste es el caso que `soloOperativas` antes del agrupado dejaba en blanco: el
  // usuario filtra por canceladas y la pantalla no mostraba nada.
  const soloCanceladas = [tr(97, "Cancelada", 10)];
  const grupos = agruparPorDestino(soloCanceladas);

  assert.equal(grupos.length, 1, "la vista quedó sin destinos");
  assert.equal(grupos[0].cantidadTransferencias, 1);
  assert.equal(grupos[0].transferencias.length, 1, "el documento no aparece");
  assert.equal(grupos[0].importeTotal, 0, "el importe operativo tiene que ser cero");
  assert.equal(totalesDeDestinos(grupos).transferencias, 1);
  assert.equal(totalesDeDestinos(grupos).importeTotal, 0);
});

test("5j. la cancelada conserva su acción: se puede abrir", () => {
  // La pantalla dibuja "Ver transferencia" con el id de la fila. Si el id no
  // viajara, el botón no podría existir.
  const [grupo] = agruparPorDestino(periodo19());
  const cancelada = grupo.transferencias.find((t) => t.estado === "Cancelada");
  assert.equal(cancelada.id, 97);
  assert.ok(cancelada.fecha, "sin fecha la fila no se puede ordenar ni mostrar");

  const src = leer("components/transferencias/ReporteTransferenciasPorDestino.jsx");
  assert.match(src, /onVerTransferencia && onVerTransferencia\(t\.id\)/);
  // Y el botón NO está condicionado al estado.
  assert.ok(!/esOperativa[^\n]*Ver transferencia/.test(src),
    "el botón de abrir se escondió para las canceladas");
});

test("5k. 'más transferencias' ordena por DOCUMENTOS, canceladas incluidas", () => {
  // Un destino con 2 operativas y otro con 1 operativa + 2 canceladas: el
  // segundo tiene MÁS documentos y tiene que ir primero.
  const dosOperativas = [
    { ...tr(1, "Enviada", 1), destinoId: 2, destino: { id: 2, nombre: "mini el 7" } },
    { ...tr(2, "Enviada", 1), destinoId: 2, destino: { id: 2, nombre: "mini el 7" } },
  ];
  const tresDocumentos = [
    tr(3, "Enviada", 1),
    tr(4, "Cancelada", 1),
    tr(5, "Cancelada", 1),
  ];
  const grupos = ordenarDestinos(agruparPorDestino([...dosOperativas, ...tresDocumentos]), "masTransferencias");
  assert.equal(grupos[0].destinoNombre, "Casiano casas",
    "ordenó por operativas en vez de por documentos");
  assert.equal(grupos[0].cantidadTransferencias, 3);
});

test("5l. 'mayor importe' ordena por importe OPERATIVO, no por el histórico", () => {
  // Casiano: 1 operativa de 100 + 1 cancelada de 10.000 → operativo 100.
  // mini el 7: 2 operativas de 100 → operativo 200. Tiene que ir primero.
  const casiano = [tr(10, "Enviada", 1), tr(11, "Cancelada", 100)];
  const mini = [
    { ...tr(12, "Enviada", 1), destinoId: 2, destino: { id: 2, nombre: "mini el 7" } },
    { ...tr(13, "Enviada", 1), destinoId: 2, destino: { id: 2, nombre: "mini el 7" } },
  ];
  const grupos = ordenarDestinos(agruparPorDestino([...casiano, ...mini]), "mayorImporte");
  assert.equal(grupos[0].destinoNombre, "mini el 7",
    "ordenó contando el importe de la cancelada");
  assert.equal(grupos[0].importeTotal, 200);
  assert.equal(grupos[1].importeTotal, 100, "Casiano suma solo su operativa");
});

test("5m. 'más reciente' mira TODOS los documentos, aunque el último esté cancelado", () => {
  const viejo = { ...tr(20, "Enviada", 1), fechaEnvio: "2026-08-01T12:00:00.000Z", createdAt: "2026-08-01T12:00:00.000Z" };
  const nuevoCancelado = { ...tr(21, "Cancelada", 1), fechaEnvio: "2026-08-19T12:00:00.000Z", createdAt: "2026-08-19T12:00:00.000Z" };
  const [grupo] = agruparPorDestino([viejo, nuevoCancelado]);
  assert.equal(
    new Date(grupo.ultimaTransferencia).toISOString(),
    "2026-08-19T12:00:00.000Z",
    "la última fecha ignoró el documento cancelado"
  );
});

test("5n. LA RUTA no vuelve a filtrar antes de agrupar", () => {
  // El defecto vivía en la ruta, no en la función. Si alguien reintroduce el
  // `soloOperativas` ahí, todo lo de arriba sigue verde y la pantalla vuelve a
  // perder documentos.
  const src = leer("app/api/transferencias/por-destino/route.js");
  assert.ok(
    !/agruparPorDestino\(\s*soloOperativas/.test(src),
    "volvió el filtro antes de agrupar: la pestaña Por destino pierde las canceladas"
  );
  assert.match(src, /agruparPorDestino\(periodo\)/,
    "la ruta no está pasando el período completo");
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

test("6. TODAS las superficies del barrido excluyen las canceladas del IMPORTE", () => {
  // ── ESTE CANDADO EXIGÍA UNA IMPLEMENTACIÓN, NO UNA PROPIEDAD ──────────────
  //
  // Pedía `soloOperativas(` en las dos rutas, y con eso obligaba a filtrar antes
  // de agrupar — que resultó ser justamente el defecto en "Por destino":
  // desaparecían los documentos cancelados junto con su importe.
  //
  // Las dos rutas resuelven lo mismo de formas distintas y las dos son
  // correctas: el listado filtra el período antes de sumar, porque sus agregados
  // son todos de movimiento; el agrupado por destino recibe el período completo
  // y separa adentro, porque necesita mostrar los documentos. Lo que se afirma
  // ahora es la propiedad —que el importe no incluya canceladas— y cada ruta la
  // consigue como le corresponde.
  const listado = leer("app/api/transferencias/listar/route.js");
  assert.match(listado, /soloOperativas\(/, "el listado no filtra las canceladas del movimiento");

  const porDestino = leer("app/api/transferencias/por-destino/route.js");
  assert.match(porDestino, /agruparPorDestino\(periodo\)/,
    "por-destino no pasa el período completo: perdería los documentos cancelados");
  assert.ok(
    !/soloOperativas/.test(porDestino),
    "por-destino volvió a filtrar antes de agrupar"
  );

  // Y en el listado, los tres agregados de movimiento salen del periodo filtrado.
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

// ── 13 · LA TRAZABILIDAD SE GUARDA Y SE PUEDE VER ───────────────────────────

test("13. el detalle EXPONE quién, cuándo y por qué se canceló", () => {
  // Guardar el rastro y no mostrarlo es lo mismo que no tenerlo: la regla es que
  // al abrir el documento después se entienda qué ocurrió.
  const src = leer("app/api/transferencias/detalle/route.js");
  assert.match(src, /cancelacion:/, "el detalle no expone el bloque de cancelación");
  assert.match(src, /transferencia\.canceladaEn/);
  assert.match(src, /transferencia\.motivoCancelacion/);
  assert.match(src, /canceladaPorId/);
  assert.match(src, /registroCompleto/,
    "sin esta marca la pantalla no puede distinguir una cancelación vieja de un error");
});

test("13b. el autor se resuelve SIN N+1: los dos ids en una consulta", () => {
  // `creadaPor` y `canceladaPorId` son enteros sin relación. Se piden juntos con
  // un `in`, no con una consulta cada uno — y cuando son la misma persona, que
  // es el caso más común, se pregunta una sola vez.
  const src = leer("app/api/transferencias/detalle/route.js");
  assert.match(src, /usuario\.findMany\(\{\s*where: \{ id: \{ in: idsAutores \} \}/,
    "los autores no se resuelven en una sola consulta");
  const cuantasConsultasDeUsuario = (src.match(/prisma\.usuario\.(findUnique|findMany|findFirst)/g) || []).length;
  assert.equal(cuantasConsultasDeUsuario, 1,
    `hay ${cuantasConsultasDeUsuario} consultas de usuario: tiene que ser una`);
});

test("13c. una cancelación HISTÓRICA con null se representa honestamente", () => {
  // La #97 se canceló antes de que las columnas existieran y queda con los tres
  // campos en null. Tres huecos en pantalla se leen como un error; hay que decir
  // qué pasó.
  const src = leer("app/api/transferencias/detalle/route.js");
  assert.match(src, /registroCompleto: transferencia\.canceladaEn != null/,
    "la marca no se deriva de la fecha");

  const header = leer("components/transferencias/TransferenciaHeader.jsx");
  assert.match(header, /Cancelada antes de habilitar el registro detallado/,
    "la pantalla no explica el caso histórico");
  assert.match(header, /!cancelacion\.registroCompleto/,
    "la pantalla no distingue los dos casos");

  // Y NO se toma prestado el motivo de la venta: son dos decisiones distintas.
  const detalle = leer("app/api/transferencias/detalle/route.js");
  assert.ok(!/motivoAnulacion/.test(detalle),
    "el detalle usa el motivo de la venta como motivo de la transferencia: eso es inventar trazabilidad");
});

test("13d. estado y rastro se escriben en la MISMA transacción", () => {
  // No se rediseña el modelo: `estado` sigue siendo el estado operativo y
  // `canceladaEn` el dato de auditoría. Lo que se garantiza es que una
  // cancelación nueva no pueda dejar uno sin el otro.
  const src = leer("app/api/transferencias/cancelar/route.js");
  const bloque = src.match(/tx\.transferencia\.update\(\{[\s\S]*?\}\);/);
  assert.ok(bloque, "no se encontró el cierre del remito");
  const data = bloque[0];
  for (const campo of ["estado", "canceladaEn", "canceladaPorId", "motivoCancelacion"]) {
    assert.ok(data.includes(campo), `el cierre del remito no escribe ${campo}`);
  }
  // Y ocurre dentro de la transacción, no después.
  const posTx = src.indexOf("$transaction");
  assert.ok(src.indexOf('estado: "Cancelada"') > posTx,
    "el estado se escribe fuera de la transacción");
});

test("11b. pero el MOTOR de reversión sigue existiendo y se usa", () => {
  // El par del anterior. Sacar la UI no puede llevarse el motor: es lo que hace
  // que la cancelación desde Transferencias sea correcta.
  assert.ok(fs.existsSync(path.join(RAIZ, "lib/pos-ventas/reversionVenta.js")));
  const cancelar = leer("app/api/transferencias/cancelar/route.js");
  assert.match(cancelar, /from "@\/lib\/pos-ventas\/reversionVenta"/);
});
