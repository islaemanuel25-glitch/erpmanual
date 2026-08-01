// Agregados del reporte de transferencias.
//
// La regla que estos tests defienden es una sola y es la que se rompe sola con
// el tiempo: los agregados representan TODO el período, nunca la página visible.
// Por eso varios casos pasan la MISMA entrada paginada y sin paginar y exigen
// que el resultado no cambie.
//
// El resto cubre lo que la pantalla promete: que el desglose cierre contra el
// total, que "con diferencias" no duplique conteos, y que null y cero sigan
// siendo cosas distintas de punta a punta.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resumenPorEstado,
  productosMasTransferidos,
  agruparPorDestino,
  ordenarDestinos,
  totalesDeDestinos,
  cantidadesDeDetalle,
  importeDeDetalle,
  nombreDeProducto,
  aCentavos,
  desdeCentavos,
  MAX_TRANSFERENCIAS,
  MAX_PRODUCTOS,
  ORDENES_DESTINO,
  ORDEN_DESTINO_DEFAULT,
} from "./agregadosPeriodo.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
// Quita comentarios: un test estructural no puede darse por satisfecho porque la
// cadena que busca aparezca dentro de una explicación.
const sinComentarios = (rel) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── Constructores de datos ──────────────────────────────────────────────────
// `producto.base` lleva unidad_medida "unidad" y factor_pack 1 para que el costo
// no se reescale: así el importe esperado es cantidad × precioCosto y los casos
// se leen sin tener que resolver la conversión mentalmente.
const prod = (id, nombre, precio = 100, nombreBase = null) => ({
  id,
  nombre,
  precio_costo: precio,
  base: { precio_costo: precio, unidad_medida: "unidad", factor_pack: 1, nombre: nombreBase },
});

const linea = (productoId, cantidad, recibido = null, precioCosto = 100, nombre = `P${productoId}`) => ({
  productoId,
  cantidad,
  recibido,
  precioCosto,
  unidadEnviada: "UNIDAD",
  producto: prod(productoId, nombre, precioCosto),
});

let seq = 0;
const tr = ({
  id = ++seq,
  estado = "Enviada",
  tieneDiferencias = false,
  destinoId = 1,
  destinoNombre = "Sucursal Belgrano",
  origenNombre = "Depósito Central",
  fechaEnvio = "2026-07-01T12:00:00.000Z",
  detalle = [linea(1, 10)],
} = {}) => ({
  id,
  estado,
  tieneDiferencias,
  destinoId,
  destino: { id: destinoId, nombre: destinoNombre },
  origen: { id: 99, nombre: origenNombre },
  fechaEnvio,
  createdAt: fechaEnvio,
  detalle,
});

// ══════════════════════════════════════════════════════════════════════════
// 1. El desglose cierra contra el total del período
// ══════════════════════════════════════════════════════════════════════════

test("1. la columna Transferencias suma exactamente el total del período", () => {
  const periodo = [
    tr({ estado: "Enviada" }),
    tr({ estado: "Enviada" }),
    tr({ estado: "Recibida", tieneDiferencias: true }),
    tr({ estado: "Recibida" }),
    tr({ estado: "Recibiendo" }),
    tr({ estado: "Cancelada" }),
  ];
  const filas = resumenPorEstado(periodo);
  const suma = filas.reduce((a, f) => a + f.cantidadTransferencias, 0);
  assert.equal(suma, periodo.length);
  assert.equal(suma, 6);
});

test("1b. los ítems del desglose suman todas las líneas del período", () => {
  const periodo = [
    tr({ estado: "Enviada", detalle: [linea(1, 5), linea(2, 3)] }),
    tr({ estado: "Recibida", detalle: [linea(1, 1), linea(3, 2), linea(4, 4)] }),
  ];
  const filas = resumenPorEstado(periodo);
  assert.equal(filas.reduce((a, f) => a + f.cantidadItems, 0), 5);
});

test("1c. el importe del desglose suma el importe del período", () => {
  const periodo = [
    tr({ estado: "Enviada", detalle: [linea(1, 10, null, 150)] }), // 1500
    tr({ estado: "Recibida", detalle: [linea(2, 4, 4, 250)] }), // 1000
  ];
  const filas = resumenPorEstado(periodo);
  assert.equal(filas.reduce((a, f) => a + f.importeTotal, 0), 2500);
});

test("1d. un estado fuera de la lista de orden igual aparece (el total no puede perder filas)", () => {
  const filas = resumenPorEstado([tr({ estado: "Pendiente" }), tr({ estado: "Enviada" })]);
  assert.equal(filas.length, 2);
  assert.equal(filas.reduce((a, f) => a + f.cantidadTransferencias, 0), 2);
  // Los conocidos van primero, el desconocido al final.
  assert.equal(filas[0].estado, "Enviada");
  assert.equal(filas[1].estado, "Pendiente");
});

test("1e. el orden de presentación es Enviada, Recibiendo, Recibida, Cancelada", () => {
  const filas = resumenPorEstado([
    tr({ estado: "Cancelada" }),
    tr({ estado: "Recibida" }),
    tr({ estado: "Enviada" }),
    tr({ estado: "Recibiendo" }),
  ]);
  assert.deepEqual(filas.map((f) => f.estado), ["Enviada", "Recibiendo", "Recibida", "Cancelada"]);
});

// ══════════════════════════════════════════════════════════════════════════
// 2. "Con diferencias" es dato secundario, no una fila
// ══════════════════════════════════════════════════════════════════════════

test("2. las diferencias viajan dentro de la fila Recibida, sin fila propia", () => {
  const filas = resumenPorEstado([
    tr({ estado: "Recibida", tieneDiferencias: true }),
    tr({ estado: "Recibida", tieneDiferencias: true }),
    tr({ estado: "Recibida" }),
  ]);
  assert.equal(filas.length, 1, "no debe crearse una fila aparte");
  assert.equal(filas[0].estado, "Recibida");
  assert.equal(filas[0].cantidadTransferencias, 3);
  assert.equal(filas[0].conDiferencias, 2);
});

test("2b. no existe ningún estado llamado 'Con diferencias'", () => {
  const filas = resumenPorEstado([tr({ estado: "Recibida", tieneDiferencias: true })]);
  assert.ok(!filas.some((f) => /diferencia/i.test(f.estado)));
});

test("2c. las con diferencias NO se suman aparte: el total sigue cerrando", () => {
  const periodo = [
    tr({ estado: "Recibida", tieneDiferencias: true }),
    tr({ estado: "Recibida", tieneDiferencias: true }),
    tr({ estado: "Enviada" }),
  ];
  const filas = resumenPorEstado(periodo);
  assert.equal(filas.reduce((a, f) => a + f.cantidadTransferencias, 0), 3);
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Los agregados NO dependen de la paginación
// ══════════════════════════════════════════════════════════════════════════

// 60 transferencias: con PAGE_SIZE 25 son 3 páginas.
const periodoGrande = Array.from({ length: 60 }, (_, i) =>
  tr({
    id: 1000 + i,
    estado: ["Enviada", "Recibida", "Recibiendo", "Cancelada"][i % 4],
    tieneDiferencias: i % 8 === 0,
    destinoId: (i % 3) + 1,
    destinoNombre: `Destino ${(i % 3) + 1}`,
    detalle: [linea((i % 5) + 1, 2, i % 2 === 0 ? 2 : null, 100)],
  })
);

test("3. el desglose de una página NO es el desglose del período", () => {
  const pagina = periodoGrande.slice(0, 25);
  const dePagina = resumenPorEstado(pagina);
  const dePeriodo = resumenPorEstado(periodoGrande);
  assert.notDeepEqual(dePagina, dePeriodo, "si coinciden, el caso no prueba nada");
  assert.equal(dePeriodo.reduce((a, f) => a + f.cantidadTransferencias, 0), 60);
  assert.equal(dePagina.reduce((a, f) => a + f.cantidadTransferencias, 0), 25);
});

test("3b. el resultado no cambia por el orden ni por trocear la entrada", () => {
  const enTrozos = [
    ...periodoGrande.slice(50),
    ...periodoGrande.slice(0, 25),
    ...periodoGrande.slice(25, 50),
  ];
  assert.deepEqual(resumenPorEstado(enTrozos), resumenPorEstado(periodoGrande));
});

test("3c. productos y destinos tampoco dependen de la página", () => {
  const pagina = periodoGrande.slice(0, 25);
  assert.notDeepEqual(
    productosMasTransferidos(pagina),
    productosMasTransferidos(periodoGrande)
  );
  assert.equal(agruparPorDestino(periodoGrande).reduce((a, g) => a + g.cantidadTransferencias, 0), 60);
  assert.equal(agruparPorDestino(pagina).reduce((a, g) => a + g.cantidadTransferencias, 0), 25);
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Agrupación por destino
// ══════════════════════════════════════════════════════════════════════════

test("4. agrupa por destino y acumula transferencias, ítems e importe", () => {
  const grupos = agruparPorDestino([
    tr({ destinoId: 1, destinoNombre: "Belgrano", detalle: [linea(1, 2, null, 100), linea(2, 1, null, 100)] }),
    tr({ destinoId: 1, destinoNombre: "Belgrano", detalle: [linea(1, 3, null, 100)] }),
    tr({ destinoId: 2, destinoNombre: "Centro", detalle: [linea(1, 5, null, 100)] }),
  ]);
  const belgrano = grupos.find((g) => g.destinoId === 1);
  assert.equal(belgrano.cantidadTransferencias, 2);
  assert.equal(belgrano.cantidadItems, 3, "ítems = líneas de detalle");
  assert.equal(belgrano.importeTotal, 600);
  assert.equal(belgrano.transferencias.length, 2);
  assert.equal(grupos.find((g) => g.destinoId === 2).importeTotal, 500);
});

test("4b. dos destinos con el mismo nombre son grupos separados (la clave es el id)", () => {
  const grupos = agruparPorDestino([
    tr({ destinoId: 1, destinoNombre: "Sucursal" }),
    tr({ destinoId: 2, destinoNombre: "Sucursal" }),
  ]);
  assert.equal(grupos.length, 2);
});

test("4c. la última transferencia del grupo es la más reciente", () => {
  const grupos = agruparPorDestino([
    tr({ destinoId: 1, fechaEnvio: "2026-07-01T10:00:00.000Z" }),
    tr({ destinoId: 1, fechaEnvio: "2026-07-20T10:00:00.000Z" }),
    tr({ destinoId: 1, fechaEnvio: "2026-07-05T10:00:00.000Z" }),
  ]);
  assert.equal(grupos[0].ultimaTransferencia, "2026-07-20T10:00:00.000Z");
  // Y el sublistado viene ordenado del más nuevo al más viejo.
  assert.deepEqual(
    grupos[0].transferencias.map((t) => t.fecha),
    ["2026-07-20T10:00:00.000Z", "2026-07-05T10:00:00.000Z", "2026-07-01T10:00:00.000Z"]
  );
});

test("4d. cada transferencia del grupo trae los campos que la UI necesita", () => {
  const [g] = agruparPorDestino([
    tr({ id: 77, estado: "Recibida", tieneDiferencias: true, detalle: [linea(1, 10, 8, 100)] }),
  ]);
  const t = g.transferencias[0];
  for (const k of [
    "id", "fecha", "origenNombre", "destinoNombre", "cantidadItems",
    "cantidadEnviada", "cantidadRecibida", "estado", "tieneDiferencias", "totalCosto",
  ]) {
    assert.ok(k in t, `falta ${k}`);
  }
  assert.equal(t.id, 77);
  assert.equal(t.cantidadEnviada, 10);
  assert.equal(t.cantidadRecibida, 8);
  assert.equal(t.tieneDiferencias, true);
});

test("4e. si no hay envío todavía, la fecha cae en createdAt", () => {
  const grupos = agruparPorDestino([
    { ...tr({ destinoId: 1 }), fechaEnvio: null, createdAt: "2026-06-15T08:00:00.000Z" },
  ]);
  assert.equal(grupos[0].transferencias[0].fecha, "2026-06-15T08:00:00.000Z");
});

test("4f. los totales del agrupado cierran con el período", () => {
  const grupos = agruparPorDestino(periodoGrande);
  const t = totalesDeDestinos(grupos);
  assert.equal(t.destinos, 3);
  assert.equal(t.transferencias, 60);
  assert.equal(t.items, 60);
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Ordenamientos de Por destino
// ══════════════════════════════════════════════════════════════════════════

// Ids FIJOS: `tr()` autoincrementa por defecto, así que dos llamadas seguidas
// producirían transferencias distintas y un deepEqual entre ambas fallaría por
// el id, no por el orden.
const gruposOrden = () =>
  agruparPorDestino([
    tr({ id: 501, destinoId: 1, destinoNombre: "Zamora", fechaEnvio: "2026-07-01T10:00:00.000Z", detalle: [linea(1, 1, null, 100)] }),
    tr({ id: 502, destinoId: 2, destinoNombre: "Alberdi", fechaEnvio: "2026-07-30T10:00:00.000Z", detalle: [linea(1, 5, null, 100)] }),
    tr({ id: 503, destinoId: 3, destinoNombre: "Mitre", fechaEnvio: "2026-07-10T10:00:00.000Z", detalle: [linea(1, 3, null, 100)] }),
    tr({ id: 504, destinoId: 3, destinoNombre: "Mitre", fechaEnvio: "2026-07-11T10:00:00.000Z", detalle: [linea(1, 1, null, 100)] }),
  ]);

test("5. mayorImporte ordena de mayor a menor", () => {
  const g = ordenarDestinos(gruposOrden(), "mayorImporte");
  assert.deepEqual(g.map((x) => x.destinoNombre), ["Alberdi", "Mitre", "Zamora"]);
});

test("5b. menorImporte ordena de menor a mayor", () => {
  const g = ordenarDestinos(gruposOrden(), "menorImporte");
  assert.deepEqual(g.map((x) => x.destinoNombre), ["Zamora", "Mitre", "Alberdi"]);
});

test("5c. masTransferencias pone primero al que más remitos tiene", () => {
  const g = ordenarDestinos(gruposOrden(), "masTransferencias");
  assert.equal(g[0].destinoNombre, "Mitre");
  assert.equal(g[0].cantidadTransferencias, 2);
});

test("5d. masReciente ordena por la última transferencia", () => {
  const g = ordenarDestinos(gruposOrden(), "masReciente");
  assert.deepEqual(g.map((x) => x.destinoNombre), ["Alberdi", "Mitre", "Zamora"]);
});

test("5e. nombreAZ ordena alfabéticamente", () => {
  const g = ordenarDestinos(gruposOrden(), "nombreAZ");
  assert.deepEqual(g.map((x) => x.destinoNombre), ["Alberdi", "Mitre", "Zamora"]);
});

test("5f. un orden desconocido cae al default y no rompe", () => {
  const g = ordenarDestinos(gruposOrden(), "loQueSea");
  assert.deepEqual(g, ordenarDestinos(gruposOrden(), ORDEN_DESTINO_DEFAULT));
  assert.equal(ORDEN_DESTINO_DEFAULT, "mayorImporte");
});

test("5g. los cinco ordenamientos son exactamente los aprobados", () => {
  assert.deepEqual(ORDENES_DESTINO, [
    "mayorImporte", "menorImporte", "masTransferencias", "masReciente", "nombreAZ",
  ]);
});

test("5h. el orden es estable: empate de importe se desempata por nombre", () => {
  const grupos = agruparPorDestino([
    tr({ destinoId: 1, destinoNombre: "Bravo", detalle: [linea(1, 1, null, 100)] }),
    tr({ destinoId: 2, destinoNombre: "Alfa", detalle: [linea(1, 1, null, 100)] }),
  ]);
  assert.deepEqual(
    ordenarDestinos(grupos, "mayorImporte").map((g) => g.destinoNombre),
    ["Alfa", "Bravo"]
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 6. Techo de 5000 y bandera truncado
// ══════════════════════════════════════════════════════════════════════════

test("6. el techo es 5000 y lo comparten los dos endpoints", () => {
  assert.equal(MAX_TRANSFERENCIAS, 5000);
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(/take:\s*MAX_TRANSFERENCIAS/.test(src), `${rel} no aplica el techo`);
    assert.ok(/truncado/.test(src), `${rel} no informa truncado`);
  }
});

test("6b. truncado se calcula comparando contra el techo, no con un booleano suelto", () => {
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(
      /length\s*>=\s*MAX_TRANSFERENCIAS/.test(src),
      `${rel} no deriva truncado del largo real`
    );
  }
});

test("6c. la UI muestra el truncamiento, no lo silencia", () => {
  const page = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(/truncado\s*&&/.test(page), "la página no renderiza el aviso");
  assert.ok(/5000/.test(page), "el aviso no dice el techo");
  const comp = sinComentarios("components/transferencias/ReporteTransferenciasPorDestino.jsx");
  assert.ok(/truncado\s*&&/.test(comp), "la vista por destino no renderiza el aviso");
});

// ══════════════════════════════════════════════════════════════════════════
// 7-8. null vs cero en productos
// ══════════════════════════════════════════════════════════════════════════

test("7. producto sin ninguna recepción cargada → recibida y diferencia en null", () => {
  const [p] = productosMasTransferidos([tr({ detalle: [linea(1, 10, null, 100)] })]);
  assert.equal(p.cantidadEnviada, 10);
  assert.equal(p.cantidadRecibida, null);
  assert.equal(p.diferencia, null);
});

test("7b. null no se contagia: otro producto con recepción sí calcula", () => {
  const ps = productosMasTransferidos([
    tr({ detalle: [linea(1, 10, null, 100), linea(2, 4, 4, 100)] }),
  ]);
  const p1 = ps.find((p) => p.productoId === 1);
  const p2 = ps.find((p) => p.productoId === 2);
  assert.equal(p1.cantidadRecibida, null);
  assert.equal(p2.cantidadRecibida, 4);
  assert.equal(p2.diferencia, 0);
});

test("8. recepción real de cero → 0, y la diferencia se calcula", () => {
  const [p] = productosMasTransferidos([tr({ detalle: [linea(1, 10, 0, 100)] })]);
  assert.equal(p.cantidadRecibida, 0);
  assert.notEqual(p.cantidadRecibida, null);
  assert.equal(p.diferencia, 10);
});

test("8b. una sola línea con recepción alcanza para que el producto deje de ser null", () => {
  const [p] = productosMasTransferidos([
    tr({ detalle: [linea(1, 5, null, 100)] }),
    tr({ detalle: [linea(1, 5, 0, 100)] }),
  ]);
  assert.equal(p.cantidadEnviada, 10);
  assert.equal(p.cantidadRecibida, 0, "la línea sin recepción no suma, pero la de 0 sí cuenta");
  assert.equal(p.diferencia, 10);
});

test("8c. el mismo criterio rige para el remito completo", () => {
  assert.equal(cantidadesDeDetalle([linea(1, 5, null)]).cantidadRecibida, null);
  assert.equal(cantidadesDeDetalle([linea(1, 5, 0)]).cantidadRecibida, 0);
});

// ══════════════════════════════════════════════════════════════════════════
// 9. Decimales exactos
// ══════════════════════════════════════════════════════════════════════════

test("9. cantidades fraccionarias no arrastran residuo binario", () => {
  const [p] = productosMasTransferidos([
    tr({ detalle: [linea(1, "0.1", "0.1", 100)] }),
    tr({ detalle: [linea(1, "0.2", "0.2", 100)] }),
  ]);
  assert.equal(p.cantidadEnviada, 0.3, "0.1 + 0.2 sumado en float da 0.30000000000000004");
  assert.equal(p.cantidadRecibida, 0.3);
  assert.equal(p.diferencia, 0);
});

test("9b. la diferencia se calcula en milésimas enteras, no restando floats", () => {
  const [p] = productosMasTransferidos([tr({ detalle: [linea(1, "1.005", "0.7", 100)] })]);
  assert.equal(p.diferencia, 0.305);
});

test("9c. cien líneas de 0.01 suman exactamente 1", () => {
  const detalle = Array.from({ length: 100 }, () => linea(1, "0.01", "0.01", 100));
  const c = cantidadesDeDetalle(detalle);
  assert.equal(c.cantidadEnviada, 1);
  assert.equal(c.cantidadRecibida, 1);
});

test("9d. importes: mil líneas de 0.1 dan 100.00 exacto", () => {
  const detalle = Array.from({ length: 1000 }, () => linea(1, 1, null, 0.1));
  assert.equal(importeDeDetalle(detalle), 100);
});

test("9e. centavos: ida y vuelta sin pérdida", () => {
  assert.equal(desdeCentavos(aCentavos(1234.56)), 1234.56);
  assert.equal(aCentavos(0.1) + aCentavos(0.2), aCentavos(0.3));
  assert.equal(aCentavos(undefined), 0);
  assert.equal(aCentavos("no es número"), 0);
});

test("9f. el importe del desglose por estado coincide con el del período", () => {
  const filas = resumenPorEstado(periodoGrande);
  const suma = filas.reduce((a, f) => a + f.importeTotal, 0);
  const directo = desdeCentavos(
    periodoGrande.reduce((a, t) => a + aCentavos(importeDeDetalle(t.detalle)), 0)
  );
  assert.equal(suma, directo);
});

// ══════════════════════════════════════════════════════════════════════════
// 10. Filtro por estado y fechas aplicado igual en todos los bloques
// ══════════════════════════════════════════════════════════════════════════

test("10. los dos endpoints arman el where con las mismas piezas", () => {
  const listar = sinComentarios("app/api/transferencias/listar/route.js");
  const destino = sinComentarios("app/api/transferencias/por-destino/route.js");
  for (const [rel, src] of [["listar", listar], ["por-destino", destino]]) {
    assert.ok(/where\.estado\s*=\s*estado/.test(src), `${rel} no filtra por estado`);
    assert.ok(/inicioDiaArgentina/.test(src), `${rel} no usa el inicio de día argentino`);
    assert.ok(/finDiaArgentina/.test(src), `${rel} no usa el fin de día argentino`);
    assert.ok(/where\.fechaEnvio/.test(src), `${rel} no acota por fechaEnvio`);
  }
});

test("10b. el rango horario se resuelve en zona argentina, no en la del proceso", () => {
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(
      !/new Date\(\s*fecha(Desde|Hasta)/.test(src),
      `${rel} construye la fecha con new Date() y perdería la zona`
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 11. Scope por ubicación
// ══════════════════════════════════════════════════════════════════════════

test("11. los dos endpoints exigen sesión, permiso y vista operativa", () => {
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(/getUsuarioSession/.test(src), `${rel} no valida sesión`);
    assert.ok(/checkPerm\(session,\s*"transferencias\.ver"\)/.test(src), `${rel} no chequea el permiso`);
    assert.ok(/resolveVistaOperativa/.test(src), `${rel} no resuelve la vista operativa`);
    assert.ok(/vista\.modo\s*===\s*"GLOBAL"/.test(src), `${rel} no distingue el modo global`);
    assert.ok(/origenId/.test(src) && /destinoId/.test(src), `${rel} no acota por participación`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 12. Sin N+1 estructural
// ══════════════════════════════════════════════════════════════════════════

test("12. por-destino resuelve todo con un solo findMany", () => {
  const src = sinComentarios("app/api/transferencias/por-destino/route.js");
  const consultas = src.match(/prisma\.\w+\.\w+\(/g) || [];
  assert.equal(consultas.length, 1, `esperaba 1 consulta, hay ${consultas.length}: ${consultas}`);
  assert.ok(/prisma\.transferencia\.findMany\(/.test(src));
});

test("12b. ninguna consulta vive dentro de un map, forEach o for", () => {
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    // Una consulta a Prisma precedida de => o dentro de un bloque de iteración
    // es la firma del N+1.
    assert.ok(
      !/\.(map|forEach|filter)\([^)]*prisma\./s.test(src),
      `${rel} consulta dentro de una iteración`
    );
  }
});

test("12c. los nombres de producto vienen por join, no por consulta aparte", () => {
  const src = sinComentarios("app/api/transferencias/listar/route.js");
  assert.ok(/productoId:\s*true/.test(src), "no pide productoId");
  assert.ok(/prisma\.productoLocal|prisma\.productoBase/.test(src) === false,
    "resuelve productos con una consulta aparte");
});

test("12d. el nombre sale de ProductoLocal con fallback a ProductoBase", () => {
  assert.equal(nombreDeProducto({ nombre: "Del local", base: { nombre: "De la base" } }), "Del local");
  assert.equal(nombreDeProducto({ nombre: null, base: { nombre: "De la base" } }), "De la base");
  assert.equal(nombreDeProducto({ nombre: "   ", base: { nombre: "De la base" } }), "De la base");
  assert.equal(nombreDeProducto({}), "Sin nombre");
});

test("12e. dos productos distintos con el mismo nombre no se fusionan", () => {
  const ps = productosMasTransferidos([
    tr({ detalle: [linea(1, 1, null, 100, "Coca 500"), linea(2, 1, null, 100, "Coca 500")] }),
  ]);
  assert.equal(ps.length, 2, "la clave es el productoId, no el nombre");
});

// ══════════════════════════════════════════════════════════════════════════
// Productos: orden y tope
// ══════════════════════════════════════════════════════════════════════════

test("P1. se ordenan por importe transferido descendente", () => {
  const ps = productosMasTransferidos([
    tr({ detalle: [linea(1, 1, null, 100), linea(2, 1, null, 900), linea(3, 1, null, 500)] }),
  ]);
  assert.deepEqual(ps.map((p) => p.importeTransferido), [900, 500, 100]);
});

test("P2. el tope de filas es el mismo que el bloque de Ventas", () => {
  assert.equal(MAX_PRODUCTOS, 20);
  const detalle = Array.from({ length: 50 }, (_, i) => linea(i + 1, 1, null, (i + 1) * 10));
  assert.equal(productosMasTransferidos([tr({ detalle })]).length, 20);
  assert.equal(productosMasTransferidos([tr({ detalle })], 5).length, 5);
});

test("P3. el más caro queda primero aunque no sea el más numeroso", () => {
  const [primero] = productosMasTransferidos([
    tr({ detalle: [linea(1, 100, null, 1), linea(2, 1, null, 5000)] }),
  ]);
  assert.equal(primero.productoId, 2);
});

// ══════════════════════════════════════════════════════════════════════════
// 13-14. La pantalla: entrada vacía, generación manual y retorno
// ══════════════════════════════════════════════════════════════════════════

test("13. la entrada sigue siendo vacía y la generación manual", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(/const \[reporteGenerado, setReporteGenerado\] = useState\(false\)/.test(src));
  assert.ok(/!reporteGenerado && !loading/.test(src), "no renderiza el estado inicial");
  assert.ok(/Seleccioná las fechas y generá el reporte/.test(src));
  // Ningún useEffect puede disparar la carga.
  assert.ok(
    !/useEffect\(\s*\(\)\s*=>\s*\{?\s*cargarPagina/.test(src),
    "hay un efecto que carga solo"
  );
  assert.ok(!/useEffect\(\(\) => \{ fetchData\(\)/.test(src), "volvió la carga automática");
});

test("13b. los agregados se leen de la respuesta, no se recalculan desde items", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(/setDesgloseEstado\(json\.resumenPorEstado/.test(src));
  assert.ok(/setProductos\(json\.productosMasTransferidos/.test(src));
  // Si la página derivara los agregados de `items`, aparecerían acumuladores
  // sobre items. No debe haberlos.
  assert.ok(!/items\.reduce/.test(src), "la página acumula sobre items");
  assert.ok(!/items\.filter\([^)]*estado/.test(src), "la página deriva estados de items");
});

test("14. el contexto de retorno lleva tab, orden, filtros, página y scroll", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  for (const campo of ["y:", "generado:", "tab:", "orden:", "estado:", "fechaDesde:", "fechaHasta:", "page:"]) {
    assert.ok(src.includes(campo), `el contexto no guarda ${campo}`);
  }
  // Y se restauran al volver.
  assert.ok(/if \(ctx\.tab\) setVista\(ctx\.tab\)/.test(src), "no restaura la tab");
  assert.ok(/if \(ctx\.orden\) setOrdenDestino\(ctx\.orden\)/.test(src), "no restaura el orden");
  assert.ok(/setScrollPendiente\(ctx\.y\)/.test(src), "no restaura el scroll");
});

test("14b. tab y orden pasan por whitelist antes de aplicarse", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(/VISTAS\.includes\(ctx\.tab\)/.test(src), "la tab no se valida");
  assert.ok(/ORDENES_DESTINO\.includes\(ctx\.orden\)/.test(src), "el orden no se valida");
});

// ══════════════════════════════════════════════════════════════════════════
// Restricciones de la UI
// ══════════════════════════════════════════════════════════════════════════

// Se mira el código SIN comentarios: mencionar "MiniInfo" en una explicación de
// por qué NO se usa no puede hacer fallar el test.
test("R1. la vista por destino no revive MiniInfo ni la expansión de la tabla", () => {
  assert.ok(
    !/MiniInfo/.test(sinComentarios("components/transferencias/ReporteTransferenciasPorDestino.jsx")),
    "revivió MiniInfo"
  );
  assert.ok(!/MiniInfo/.test(sinComentarios("app/modulos/transferencias/page.jsx")));
  const tabla = sinComentarios("components/transferencias/TablaTransferencias.jsx");
  assert.ok(!/aria-expanded/.test(tabla), "la tabla principal volvió a expandir filas");
  const fila = sinComentarios("components/transferencias/FilaTransferencia.jsx");
  assert.ok(!/MiniInfo/.test(fila), "la fila volvió a usar MiniInfo");
});

test("R2. ningún bloque nuevo usa modal, portal ni overlay", () => {
  for (const rel of [
    "app/modulos/transferencias/page.jsx",
    "components/transferencias/ReporteTransferenciasPorDestino.jsx",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(!/createPortal/.test(src), `${rel} usa portal`);
    assert.ok(!/fixed inset-0/.test(src), `${rel} usa overlay`);
    assert.ok(!/<dialog/.test(src), `${rel} usa dialog`);
    assert.ok(!/role="dialog"/.test(src), `${rel} usa role dialog`);
  }
});

// Lo prohibido es IMPORTAR de Ventas, no nombrarlo: los comentarios dicen de
// dónde se copió el patrón y eso es información útil, no una dependencia.
test("R3. Reportes de Ventas no se importa desde Transferencias", () => {
  for (const rel of [
    "app/modulos/transferencias/page.jsx",
    "components/transferencias/ReporteTransferenciasPorDestino.jsx",
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
    "lib/transferencias/agregadosPeriodo.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(!/reportes-ventas/.test(src), `${rel} referencia código de Ventas`);
    assert.ok(!/from\s+["'][^"']*reportes-ventas/.test(src), `${rel} importa de Ventas`);
  }
});

// Y a la inversa: el entregable no puede haber tocado Ventas.
test("R3b. los archivos de Ventas no conocen Transferencias", () => {
  for (const rel of [
    "app/modulos/reportes-ventas/page.jsx",
    "components/reportes-ventas/ReporteVentasPorCliente.jsx",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(!/transferencias/i.test(src), `${rel} fue modificado para este reporte`);
  }
});

test("R4. la tab por destino solo se monta cuando está activa", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(
    /vista === "destino" && \(\s*<ReporteTransferenciasPorDestino/.test(src),
    "el componente se monta siempre y consultaría el endpoint de más"
  );
});

test("R5. el botón Columnas solo aparece en Por transferencia", () => {
  const src = sinComentarios("app/modulos/transferencias/page.jsx");
  assert.ok(/vista === "transferencia" && \(/.test(src));
  const idxTab = src.indexOf('vista === "transferencia" && (');
  const idxCols = src.indexOf("Columnas", idxTab);
  assert.ok(idxTab !== -1 && idxCols > idxTab, "Columnas no está condicionado a la tab");
});

test("R6. ninguna API nueva escribe: solo lectura", () => {
  for (const rel of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(
      !/prisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)/.test(src),
      `${rel} escribe en la base`
    );
    assert.ok(!/\$transaction/.test(src), `${rel} abre una transacción`);
    assert.ok(!/\$executeRaw/.test(src), `${rel} ejecuta SQL crudo`);
  }
});
