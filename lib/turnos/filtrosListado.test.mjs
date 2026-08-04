// Pruebas del filtrado del listado de cajas.
//
//   node --import ./scripts/alias-loader.mjs --test lib/turnos/filtrosListado.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizarEstado,
  condicionEstado,
  rangoListado,
  normalizarPaginacion,
  construirWhereTurnos,
  resolverLocalListado,
  ORDEN_LISTADO,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
} from "@/lib/turnos/filtrosListado";

const HOY = "2026-08-03";

// ── Estado ─────────────────────────────────────────────────────────────────

test("1. el estado por defecto de una consulta sin parámetro es 'todas'", () => {
  assert.equal(normalizarEstado(undefined), "todas");
  assert.equal(normalizarEstado(null), "todas");
  assert.equal(normalizarEstado(""), "todas");
  assert.equal(normalizarEstado("cualquier-cosa"), "todas");
});

test("2. los valores viejos de una pestaña sin recargar siguen funcionando", () => {
  // Devolverle "sin resultados" a una pestaña vieja sería un bug invisible.
  assert.equal(normalizarEstado("abierto"), "abiertas");
  assert.equal(normalizarEstado("cerrado"), "cerradas");
  assert.equal(normalizarEstado("todos"), "todas");
});

test("3. 'Abiertas' excluye las anuladas Y las que ya tomaron su corte de cierre", () => {
  // Una anulada tiene cierre != null, así que `cierre: null` ya la dejaría
  // afuera; el segundo predicado lo hace explícito y resistente a que en el
  // futuro se anule un turno sin cerrarlo.
  //
  // `cierreEnPreparacionEn: null` es el tercero, y es el que importa desde el
  // cierre con relevo: una caja cortada sigue con `cierre` en null pero ya no
  // vende. Llamarla "Abierta" en el listado sería mentir sobre su estado.
  assert.deepEqual(condicionEstado("abiertas"), {
    cierre: null,
    cierreEnPreparacionEn: null,
    anuladoEn: null,
  });
});

test("3b. 'En preparación' trae exactamente las cortadas y sin cerrar", () => {
  assert.deepEqual(condicionEstado("en_preparacion"), {
    cierre: null,
    cierreEnPreparacionEn: { not: null },
    anuladoEn: null,
  });
  assert.equal(normalizarEstado("en_preparacion"), "en_preparacion");
});

test("4. 'Cerradas' NO incluye las anuladas — el bug original", () => {
  // Los turnos anulados quedaron con `cierre` seteado (se cerraron para liberar
  // el local). Sin `anuladoEn: null` aparecían mezclados con los cierres reales.
  const c = condicionEstado("cerradas");
  assert.deepEqual(c, { cierre: { not: null }, anuladoEn: null });
});

test("5. 'Anuladas' trae solo anuladas", () => {
  assert.deepEqual(condicionEstado("anuladas"), { anuladoEn: { not: null } });
});

test("6. 'Todas' no impone condición de estado", () => {
  assert.deepEqual(condicionEstado("todas"), {});
});

test("7. los cuatro estados concretos son mutuamente excluyentes", () => {
  // Un turno cae en exactamente uno. Se modela cada combinación posible.
  const casos = [
    { nombre: "abierta", cierre: null, cierreEnPreparacionEn: null, anuladoEn: null },
    { nombre: "en_preparacion", cierre: null, cierreEnPreparacionEn: new Date(), anuladoEn: null },
    { nombre: "cerrada", cierre: new Date(), cierreEnPreparacionEn: null, anuladoEn: null },
    { nombre: "anulada", cierre: new Date(), cierreEnPreparacionEn: null, anuladoEn: new Date() },
  ];
  const cumple = (t, cond) =>
    Object.entries(cond).every(([campo, esperado]) => {
      const valor = t[campo];
      if (esperado === null) return valor === null;
      if (esperado && typeof esperado === "object" && "not" in esperado) {
        return esperado.not === null ? valor !== null : valor === esperado.not;
      }
      return valor === esperado;
    });

  // "en_preparacion" no pluraliza como los otros tres.
  const filtroDe = (nombre) => (nombre === "en_preparacion" ? nombre : `${nombre}s`);

  for (const t of casos) {
    const coincidencias = ["abiertas", "en_preparacion", "cerradas", "anuladas"].filter((e) =>
      cumple(t, condicionEstado(e))
    );
    assert.deepEqual(
      coincidencias,
      [filtroDe(t.nombre)],
      `"${t.nombre}" debería coincidir con exactamente un estado, coincidió con ${coincidencias}`
    );
  }
});

// ── Fechas ─────────────────────────────────────────────────────────────────

test("8. sin fechas el rango es HOY, no todo el historial", () => {
  // Ésta es la corrección central: entrar a la pantalla no debe traer el
  // historial completo del local.
  const r = rangoListado({ hoy: HOY });
  assert.equal(r.desde, HOY);
  assert.equal(r.hasta, HOY);
  assert.ok(r.gte instanceof Date && !isNaN(r.gte));
  assert.ok(r.lte instanceof Date && !isNaN(r.lte));
});

test("9. el rango siempre queda acotado por ambos extremos", () => {
  for (const caso of [
    {},
    { fechaDesde: "2026-01-01" },
    { fechaHasta: "2026-01-31" },
    { fechaDesde: "2026-01-01", fechaHasta: "2026-01-31" },
  ]) {
    const r = rangoListado({ ...caso, hoy: HOY });
    assert.ok(r.gte instanceof Date && !isNaN(r.gte), "gte inválido");
    assert.ok(r.lte instanceof Date && !isNaN(r.lte), "lte inválido");
  }
});

test("10. con un solo extremo, el otro lo espeja (un día suelto)", () => {
  assert.deepEqual(
    { ...rangoListado({ fechaDesde: "2026-07-01", hoy: HOY }) }.hasta,
    "2026-07-01"
  );
  assert.equal(rangoListado({ fechaHasta: "2026-07-01", hoy: HOY }).desde, "2026-07-01");
});

test("11. un rango histórico amplio se respeta tal cual", () => {
  // No se rompe la consulta histórica consciente.
  const r = rangoListado({ fechaDesde: "2025-01-01", fechaHasta: "2026-08-03", hoy: HOY });
  assert.equal(r.desde, "2025-01-01");
  assert.equal(r.hasta, "2026-08-03");
  assert.ok(r.gte < r.lte);
});

test("12. una fecha con formato inválido cae a hoy en vez de romper la consulta", () => {
  // Un `Invalid Date` en Prisma reventaría el listado entero.
  const r = rangoListado({ fechaDesde: "no-es-fecha", fechaHasta: "tampoco", hoy: HOY });
  assert.ok(r.gte instanceof Date && !isNaN(r.gte));
  assert.ok(r.lte instanceof Date && !isNaN(r.lte));
});

test("13. el rango respeta el día argentino, no UTC", () => {
  // El contenedor corre en UTC: sin offset explícito, "hasta el 03/08" cortaría
  // a las 20:59:59 hora argentina y escondería lo hecho hasta la medianoche.
  const r = rangoListado({ fechaDesde: HOY, fechaHasta: HOY, hoy: HOY });
  assert.equal(r.gte.toISOString(), "2026-08-03T03:00:00.000Z");
  assert.equal(r.lte.toISOString(), "2026-08-04T02:59:59.999Z");
});

// ── Orden ──────────────────────────────────────────────────────────────────

test("14. el orden pone abiertas primero, cerradas después y anuladas al final", () => {
  assert.deepEqual(ORDEN_LISTADO[0], { anuladoEn: { sort: "asc", nulls: "first" } });
  assert.deepEqual(ORDEN_LISTADO[1], { cierre: { sort: "desc", nulls: "first" } });
  assert.deepEqual(ORDEN_LISTADO[2], { apertura: "desc" });
});

// ── Paginación ─────────────────────────────────────────────────────────────

test("15. la paginación tiene un default y no se puede pedir todo de una", () => {
  assert.deepEqual(normalizarPaginacion(), {
    page: 1,
    pageSize: PAGE_SIZE_DEFAULT,
    skip: 0,
    take: PAGE_SIZE_DEFAULT,
  });
  // Un pageSize enorme se recorta: sin tope, ?pageSize=999999 sería otra vez
  // "descargar todo el historial".
  assert.equal(normalizarPaginacion({ pageSize: 999999 }).pageSize, PAGE_SIZE_MAX);
});

test("16. valores basura de paginación no rompen el skip/take", () => {
  for (const v of [null, undefined, "", "abc", -5, 0, 1.5]) {
    const p = normalizarPaginacion({ page: v, pageSize: v });
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, PAGE_SIZE_DEFAULT);
    assert.equal(p.skip, 0);
  }
});

test("17. el skip corresponde a la página pedida", () => {
  const p = normalizarPaginacion({ page: 3, pageSize: 20 });
  assert.equal(p.skip, 40);
  assert.equal(p.take, 20);
});

// ── Where completo ─────────────────────────────────────────────────────────

test("18. el listado NUNCA queda sin filtro de ubicación", () => {
  // Una consulta global accidental es justamente lo que se está corrigiendo.
  for (const malo of [undefined, null, 0, -1, "4", 1.5, NaN]) {
    assert.throws(
      () => construirWhereTurnos({ localId: malo, hoy: HOY }),
      /localId válido/,
      `localId=${String(malo)} debería ser rechazado`
    );
  }
});

test("19. el where por defecto: local + hoy, sin filtro de estado", () => {
  const { where } = construirWhereTurnos({ localId: 4, hoy: HOY });
  assert.equal(where.localId, 4);
  assert.ok(where.apertura.gte instanceof Date);
  assert.ok(where.apertura.lte instanceof Date);
  assert.equal("vendedorId" in where, false);
});

test("20. el where del estado inicial de la pantalla: local 4, hoy, abiertas", () => {
  // Réplica exacta de la prueba 1 del pedido.
  const { where } = construirWhereTurnos({
    localId: 4,
    estado: "abiertas",
    hoy: HOY,
  });
  assert.equal(where.localId, 4);
  assert.equal(where.cierre, null);
  assert.equal(where.anuladoEn, null);
  assert.equal(where.apertura.gte.toISOString(), "2026-08-03T03:00:00.000Z");
  assert.equal(where.apertura.lte.toISOString(), "2026-08-04T02:59:59.999Z");
});

test("21. el vendedor se aplica en la consulta, no en el frontend", () => {
  const { where } = construirWhereTurnos({ localId: 4, vendedorId: 9, hoy: HOY });
  assert.equal(where.vendedorId, 9);
});

test("22. un vendedorId inválido no agrega un filtro roto", () => {
  for (const v of [null, undefined, 0, -3, "abc", NaN]) {
    const { where } = construirWhereTurnos({ localId: 4, vendedorId: v, hoy: HOY });
    assert.equal("vendedorId" in where, false, `vendedorId=${String(v)}`);
  }
});

test("23. filtrar por anuladas no arrastra la condición de cierre", () => {
  const { where } = construirWhereTurnos({ localId: 4, estado: "anuladas", hoy: HOY });
  assert.deepEqual(where.anuladoEn, { not: null });
  assert.equal("cierre" in where, false);
});

// ── El local sale del contexto, no de la pantalla ──────────────────────────

test("25. sin localId en la consulta, el local es el del contexto activo", () => {
  assert.deepEqual(resolverLocalListado({ localContexto: 4 }), { localId: 4 });
  // Solo la AUSENCIA real vale. El route pasa `undefined` cuando el parámetro no
  // vino, nunca un string vacío.
  for (const ausente of [undefined, null]) {
    assert.deepEqual(
      resolverLocalListado({ localContexto: 4, localIdParam: ausente }),
      { localId: 4 },
      `localIdParam=${String(ausente)}`
    );
  }
});

test("25b. `?localId=` vacío también se rechaza", () => {
  // Presente-pero-vacío es presente. Si se tratara como ausente, bastaría con
  // mandar el parámetro sin valor para saltear la regla.
  const r = resolverLocalListado({ localContexto: 4, localIdParam: "" });
  assert.equal(r.localId, undefined);
  assert.equal(r.status, 400);
});

test("26. un localId manipulado NO puede cambiar el local consultado", () => {
  // El corazón del requisito: la pantalla no tiene selector y mandar otro local
  // a mano tiene que fallar, no devolver datos de esa otra ubicación.
  for (const ajeno of [5, "5", 1, 999]) {
    const r = resolverLocalListado({ localContexto: 4, localIdParam: ajeno });
    assert.equal(r.localId, undefined, `localIdParam=${ajeno} devolvió un local`);
    assert.equal(r.status, 400);
    assert.match(r.error, /contexto activo/i);
  }
});

test("27. el localId COINCIDENTE tampoco se acepta", () => {
  // Aceptar el coincidente parece inocuo —devuelve lo mismo— pero convierte al
  // parámetro en parte del contrato: invita a mandarlo, y cualquier cambio
  // futuro que relaje la comparación reabre el agujero sin que nada lo note.
  // No hay grados: presente = rechazado.
  for (const igual of [4, "4"]) {
    const r = resolverLocalListado({ localContexto: 4, localIdParam: igual });
    assert.equal(r.localId, undefined, `localIdParam=${igual} fue aceptado`);
    assert.equal(r.status, 400);
    assert.match(r.error, /no acepta el par.metro localId/i);
  }
});

test("28. un localId con basura se rechaza, no se interpreta", () => {
  for (const basura of ["abc", "4; DROP TABLE", "-1", "0", "1.5", "  "]) {
    const r = resolverLocalListado({ localContexto: 4, localIdParam: basura });
    assert.equal(r.localId, undefined, `basura=${basura} pasó`);
    assert.equal(r.status, 400);
  }
});

test("31. NINGÚN valor de localId es aceptable — barrido exhaustivo", () => {
  // La regla en una sola prueba: si el parámetro viene, no importa qué traiga.
  const valores = [4, "4", 5, "5", 0, -1, 1.5, "abc", " ", "null", "undefined",
    "4 ", "+4", "0x4", "4e0", true, false, [], {}, "٤"];
  for (const v of valores) {
    const r = resolverLocalListado({ localContexto: 4, localIdParam: v });
    assert.equal(r.localId, undefined, `localIdParam=${JSON.stringify(v)} devolvió un local`);
    assert.equal(r.status, 400, `localIdParam=${JSON.stringify(v)} no dio 400`);
  }
});

test("29. sin contexto no hay listado posible: es un error de programación", () => {
  // Nunca debe poder construirse una consulta sin ubicación resuelta por el
  // backend. Si el contexto no llegó, es un bug, no un caso a tolerar.
  for (const malo of [undefined, null, 0, -1, "4", NaN]) {
    assert.throws(
      () => resolverLocalListado({ localContexto: malo, localIdParam: 4 }),
      /contexto activo/,
      `localContexto=${String(malo)} debería reventar`
    );
  }
});

test("30. el local resuelto es el único que llega al where", () => {
  // Integración de las dos piezas: lo que resuelve el contexto es lo que filtra.
  const { localId } = resolverLocalListado({ localContexto: 7 });
  const { where } = construirWhereTurnos({ localId, hoy: HOY });
  assert.equal(where.localId, 7);
});

test("24. una consulta histórica amplia y consciente sigue siendo posible", () => {
  const { where, rango } = construirWhereTurnos({
    localId: 4,
    estado: "todas",
    fechaDesde: "2024-01-01",
    fechaHasta: "2026-08-03",
    hoy: HOY,
  });
  assert.equal(rango.desde, "2024-01-01");
  assert.equal(where.localId, 4);
  assert.equal("cierre" in where, false);
  assert.equal("anuladoEn" in where, false);
  assert.ok(where.apertura.gte < where.apertura.lte);
});
