// scripts/sonda-tiempos-productos.mjs
//
// CUÁNTO TARDA PRODUCTOS, Y EN QUÉ SE LE VA EL TIEMPO.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Después de desplegar el issue #2, la pantalla de Productos se sintió lenta al
// abrir. "Se siente lenta" no es un diagnóstico: puede ser el conteo de las
// cards, puede ser el listado, puede ser el render, y puede ser que los pedidos
// salgan en cascada en vez de en paralelo. Cada una tiene un arreglo distinto y
// tres de los cuatro son inútiles si el cuello está en el otro.
//
// Esta sonda mide el TRABAJO DE SERVIDOR, fase por fase, con los datos reales.
// No mide el render ni la red: eso se mira aparte, y está dicho abajo cuál es
// cuál para que nadie lea de más en estos números.
//
// ── DÓNDE CORRE ─────────────────────────────────────────────────────────────
//
// En un contenedor DESCARTABLE de la misma imagen, nunca dentro del que atiende:
//
//   docker compose -f docker-compose.prod.yml run --rm --no-deps -T app \
//     node --import /app/scripts/alias-loader.mjs --input-type=module - < esta-sonda
//
// Corre igual en local con la base de desarrollo. Pide `LECTURA`: no escribe
// nada y por eso puede mirar producción.
//
// ── QUÉ MIDE, FASE POR FASE ─────────────────────────────────────────────────
//
// Reproduce las consultas de las dos rutas que la pantalla pide al abrir, con
// las MISMAS piezas —`filtrosBaseDelCatalogo`, el select de controles, la
// clasificación— y no con copias parecidas. Si mañana cambia el `where` del
// listado, cambia también el de acá.
//
// Cada fase se corre varias veces y se informa la MEDIANA y el mínimo. La
// primera corrida de cada fase incluye el arranque del pool y la compilación del
// plan; informar solo esa mediría el arranque, no la consulta.

import { crearClientePrisma, LECTURA } from "@/scripts/lib/clientePrisma.mjs";

const { filtrosBaseDelCatalogo } = await import("@/lib/productos/whereCatalogo.js");
const {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  opcionesDelTecho,
  contarDesdePrisma,
  filaMarcadaPor,
  filaParaControles,
} = await import("@/lib/productos/controlesDesdePrisma.js");
const { traerFilasParaControles } = await import("@/lib/productos/sqlControles.js");
const { CONTROLES, marcadoPor, IDS_CONTROL } = await import("@/lib/productos/controlesCalidad.js");
const { ubicacionVendeAlCosto } = await import("@/lib/precios/ubicacionVendeAlCosto.js");
const { mergeBaseLocalToUi } = await import("@/lib/mappers/producto.js");

const CORRIDAS = Number(leerArg("--corridas") || 3);
const CONTROL_A_MEDIR = leerArg("--control") || "precio-vencido";
const LOCAL_PEDIDO = Number(leerArg("--local") || 0) || null;
const SOLO_CONTRAPRUEBA = process.argv.includes("--contraprueba");

function leerArg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : null;
}

/** Corre `fn` varias veces y devuelve mediana, mínimo y el último resultado. */
async function medir(etiqueta, fn) {
  const tiempos = [];
  let ultimo = null;
  for (let i = 0; i < CORRIDAS; i++) {
    const t0 = process.hrtime.bigint();
    ultimo = await fn();
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const ordenados = [...tiempos].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  return { etiqueta, mediana, min: ordenados[0], max: ordenados[ordenados.length - 1], ultimo };
}

const ms = (n) => `${n.toFixed(0)} ms`;

function informar(m, nota = "") {
  console.log(
    `  ${m.etiqueta.padEnd(46)} ${ms(m.mediana).padStart(9)}` +
      `   (min ${ms(m.min)}, max ${ms(m.max)})${nota ? `  ${nota}` : ""}`
  );
  return m.mediana;
}

const prisma = await crearClientePrisma({ nivel: LECTURA });

try {
  // ── QUÉ UBICACIÓN SE MIDE ────────────────────────────────────────────────
  //
  // Sin `--local`, la que más productos visibles tiene: es el peor caso real y
  // es el que hay que arreglar. Medir la más chica daría un número lindo que no
  // describe a nadie.
  //
  // El grupo NO es una columna de `Local`: cuelga de `GrupoLocal` —o de
  // `GrupoDeposito` si la ubicación es el depósito—. Pedirlo como campo hace que
  // Prisma conteste `Unknown field grupoId`, que es exactamente lo que pasó la
  // primera vez que esta sonda corrió contra producción.
  const [filas, comoLocal, comoDeposito] = await Promise.all([
    prisma.local.findMany({ select: { id: true, nombre: true, es_deposito: true }, orderBy: { id: "asc" } }),
    prisma.grupoLocal.findMany({ select: { localId: true, grupoId: true } }),
    prisma.grupoDeposito.findMany({ select: { localId: true, grupoId: true } }),
  ]);
  const grupoDeLocal = new Map();
  for (const g of [...comoLocal, ...comoDeposito]) grupoDeLocal.set(g.localId, g.grupoId);

  const locales = filas
    .map((l) => ({ ...l, grupoId: grupoDeLocal.get(l.id) ?? null }))
    .filter((l) => l.grupoId !== null);

  if (locales.length === 0) {
    console.error("ABORTADO: no hay ninguna ubicación en esta base.");
    process.exit(2);
  }

  let elegido = LOCAL_PEDIDO ? locales.find((l) => l.id === LOCAL_PEDIDO) : null;
  if (LOCAL_PEDIDO && !elegido) {
    console.error(`ABORTADO: no existe la ubicación ${LOCAL_PEDIDO}.`);
    process.exit(2);
  }

  const universoDe = (l) => ({
    AND: [
      ...filtrosBaseDelCatalogo({ grupoId: l.grupoId, localId: l.id }),
      {
        OR: [
          { es_combo: false, activo: true },
          { es_combo: true, locales: { some: { localId: l.id, activo: true } } },
        ],
      },
    ],
  });

  if (!elegido) {
    const conteos = [];
    for (const l of locales) {
      conteos.push({ l, n: await prisma.productoBase.count({ where: universoDe(l) }) });
    }
    conteos.sort((a, b) => b.n - a.n);
    elegido = conteos[0].l;
    console.log("Ubicaciones y tamaño de catálogo activo:");
    for (const c of conteos) {
      console.log(`  ${String(c.n).padStart(6)}  ${c.l.nombre}${c.l.es_deposito ? " (depósito)" : ""}`);
    }
    console.log("");
  }

  const localId = elegido.id;
  const grupoId = elegido.grupoId;
  const where = universoDe(elegido);

  console.log(`Ubicación medida: ${elegido.nombre} (id ${localId}), ${CORRIDAS} corridas por fase.`);
  console.log("");

  /**
   * ── EL CAMINO VIEJO, ESCRITO ACÁ A PROPÓSITO ───────────────────────────
   *
   * Es la consulta que las dos rutas tenían adentro antes de esta tanda. Se
   * conserva para poder medir el ANTES contra el DESPUÉS en la misma corrida,
   * con la misma base y el mismo minuto — que es la única forma de que la
   * comparación signifique algo. Comparar contra un número anotado ayer mide
   * también la carga de ayer.
   *
   * NO la usa ninguna ruta: es la referencia contra la que se mide.
   */
  const traerComoAntes = () =>
    prisma.productoBase.findMany({
      where,
      ...opcionesDelTecho(),
      select: {
        ...SELECT_CONTROLES_BASE,
        locales: { where: { localId }, take: 1, select: SELECT_CONTROLES_LOCAL },
      },
    });

  // ── LA CONTRAPRUEBA DE LA OPTIMIZACIÓN ───────────────────────────────────
  //
  // La afirmación de la tanda es "cambia el transporte, no el resultado". Eso no
  // se prueba leyendo: se prueba clasificando el catálogo entero por los DOS
  // caminos y comparando los cuatro controles de cada producto.
  if (SOLO_CONTRAPRUEBA) {
    const antes = await traerComoAntes();
    const { filas: despues } = await traerFilasParaControles(prisma, { where, localId });

    console.log(`Contraprueba del transporte: ${antes.length} filas por el camino viejo, ${despues.length} por el nuevo.`);
    if (antes.length !== despues.length) {
      console.error("ROJO: los dos caminos traen distinta cantidad de filas.");
      process.exit(1);
    }

    const porId = new Map(
      despues.map((f) => [f.id, filaParaControles(f, f.locales?.[0] ?? null)])
    );
    const ahora = new Date();
    let diferencias = 0;
    const ejemplos = [];
    for (const p of antes) {
      const a = filaParaControles(p, p.locales?.[0] ?? null);
      const b = porId.get(a.id);
      if (!b) {
        diferencias++;
        if (ejemplos.length < 5) ejemplos.push(`id ${a.id}: no vino por el camino nuevo`);
        continue;
      }
      for (const c of IDS_CONTROL) {
        if (marcadoPor(c, a, ahora) !== marcadoPor(c, b, ahora)) {
          diferencias++;
          if (ejemplos.length < 5) ejemplos.push(`id ${a.id}, control ${c}`);
        }
      }
      // Y no solo el veredicto: los campos mergeados tienen que ser el mismo
      // número. Un veredicto igual por dos valores distintos es una coincidencia,
      // no una equivalencia.
      for (const k of ["precio_costo", "precio_venta", "margen", "recargoFijoUnidad", "factor_pack", "pesoReferenciaKg"]) {
        const na = a[k] === null || a[k] === undefined ? null : Number(a[k]);
        const nb = b[k] === null || b[k] === undefined ? null : Number(b[k]);
        if (na !== nb) {
          diferencias++;
          if (ejemplos.length < 5) ejemplos.push(`id ${a.id}, campo ${k}: ${na} vs ${nb}`);
        }
      }
      const ta = a.precioRevisadoAt ? new Date(a.precioRevisadoAt).getTime() : null;
      const tb = b.precioRevisadoAt ? new Date(b.precioRevisadoAt).getTime() : null;
      if (ta !== tb) {
        diferencias++;
        if (ejemplos.length < 5) ejemplos.push(`id ${a.id}, precioRevisadoAt: ${ta} vs ${tb}`);
      }
      if (a.reglaPrecio !== b.reglaPrecio) {
        diferencias++;
        if (ejemplos.length < 5) ejemplos.push(`id ${a.id}, reglaPrecio: ${a.reglaPrecio} vs ${b.reglaPrecio}`);
      }
    }

    // ── CUÁNTAS FILAS EJERCIERON LA FECHA ─────────────────────────────────
    //
    // Sin esto, "cero diferencias" sobre un catálogo donde `precioRevisadoAt`
    // está en null en todas las filas no dice nada sobre la fecha: estaría
    // comparando null contra null 2.363 veces. Se informa el número para que
    // quien lea sepa qué se ejerció y qué no.
    const conFecha = antes.filter((p) => p.locales?.[0]?.precioRevisadoAt).length;

    console.log(diferencias === 0 ? "  IDÉNTICO: 0 diferencias." : `  ${diferencias} DIFERENCIAS:`);
    for (const e of ejemplos) console.log("   " + e);
    console.log(
      `  filas con precioRevisadoAt cargado: ${conFecha}` +
        (conFecha === 0 ? "  ← la fecha NO se ejerció por esta vía" : "")
    );

    // ── LA FECHA, EJERCIDA POR OTRA COLUMNA DEL MISMO TIPO ────────────────
    //
    // `precioRevisadoAt` está en null en TODAS las filas de producción —no se
    // backfilleó a propósito—, así que la comparación de arriba estuvo cotejando
    // null contra null 2.363 veces. Eso no dice nada sobre si el SQL crudo
    // decodifica una fecha igual que `findMany`, y esa es justamente la parte del
    // cambio que no es obvia: `$queryRaw` arma los `Date` por su cuenta.
    //
    // Fabricar una fecha para probarlo está prohibido en este repo, y con razón.
    // Lo que sí se puede es ejercer la MISMA decodificación sobre otra columna
    // del MISMO tipo que sí tiene datos: `ProductoLocal.updatedAt` es `DateTime`
    // igual que `precioRevisadoAt` —las dos son `timestamp(3)` en Postgres—, está
    // en la misma tabla y en las mismas filas, y nunca es null.
    //
    // No es lo mismo que ejercer el campo real y no se presenta como si lo fuera:
    // es la prueba de que el CAMINO de la fecha da igual por los dos lados.
    const idsLocales = antes.map((p) => p.locales?.[0]?.id).filter(Boolean);
    if (idsLocales.length === 0) {
      console.log("  fechas: no hay ningún ProductoLocal en esta ubicación, no se pudo ejercer");
    } else {
      const porPrisma = await prisma.productoLocal.findMany({
        where: { id: { in: idsLocales } },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      const porCrudo = await prisma.$queryRawUnsafe(
        'SELECT id, "updatedAt" FROM "ProductoLocal" WHERE id = ANY($1::int[]) ORDER BY id ASC',
        idsLocales
      );
      let fechasDistintas = 0;
      const mapaCrudo = new Map(porCrudo.map((r) => [Number(r.id), r.updatedAt]));
      for (const f of porPrisma) {
        const a = f.updatedAt instanceof Date ? f.updatedAt.getTime() : NaN;
        const otro = mapaCrudo.get(f.id);
        const b = otro instanceof Date ? otro.getTime() : NaN;
        if (!(a === b)) {
          fechasDistintas++;
          if (fechasDistintas <= 3) console.log(`   fecha id ${f.id}: ${f.updatedAt} vs ${otro}`);
        }
      }
      console.log(
        `  fechas (ejercidas con updatedAt, mismo tipo): ${porPrisma.length} comparadas, ` +
          `${fechasDistintas} distintas`
      );
      diferencias += fechasDistintas;
    }

    if (diferencias > 0) process.exit(1);
    await prisma.$disconnect();
    process.exit(0);
  }

  // ══ RUTA /api/productos/controles ═════════════════════════════════════════
  console.log("/api/productos/controles  — los cuatro contadores de \"Para revisar\"");

  const mAntes = await medir("ANTES: findMany con la relación anidada", traerComoAntes);
  informar(mAntes, `${mAntes.ultimo.length} filas`);

  const mTraerControles = await medir("AHORA: traerFilasParaControles", () =>
    traerFilasParaControles(prisma, { where, localId })
  );
  const filasControles = mTraerControles.ultimo.filas;
  informar(mTraerControles, `${filasControles.length} filas`);

  const mClasificar = await medir("clasificar en memoria", async () =>
    contarDesdePrisma(filasControles)
  );
  const conteo = mClasificar.ultimo;
  informar(mClasificar);

  const totalControles = mTraerControles.mediana + mClasificar.mediana;
  const totalAntes = mAntes.mediana + mClasificar.mediana;
  console.log(`  ${"TOTAL de la ruta, ANTES".padEnd(46)} ${ms(totalAntes).padStart(9)}`);
  console.log(`  ${"TOTAL de la ruta, AHORA".padEnd(46)} ${ms(totalControles).padStart(9)}`);
  console.log(
    "  conteo: " +
      CONTROLES.map((c) => `${c.id}=${conteo[c.id] ?? 0}`).join("  ") +
      (mTraerControles.ultimo.truncado ? "  (TRUNCADO)" : "")
  );
  console.log("");

  // ══ RUTA /api/productos/listar — SIN control ══════════════════════════════
  console.log("/api/productos/listar  — primera página, sin control");

  const incluir = {
    categoria: { select: { id: true, nombre: true } },
    proveedor: { select: { id: true, nombre: true } },
    proveedor2: { select: { id: true, nombre: true } },
    proveedor3: { select: { id: true, nombre: true } },
    area_fisica: { select: { id: true, nombre: true } },
    locales: {
      where: { localId },
      take: 1,
      select: {
        id: true,
        localId: true,
        precio_costo: true,
        precio_venta: true,
        margen: true,
        activo: true,
        nombre: true,
        descripcion: true,
        reglaPrecio: true,
        recargoFijoUnidad: true,
        codigo_barra_propio: true,
        recargoServicioPct: true,
        precioRevisadoAt: true,
      },
    },
    codigosProveedor: { where: { activo: true }, select: { codigoInterno: true, proveedorId: true } },
  };

  const mAlCosto = await medir("ubicacionVendeAlCosto", () =>
    ubicacionVendeAlCosto({ prisma, grupoId, localId })
  );
  informar(mAlCosto);

  const mCount = await medir("count del total", () => prisma.productoBase.count({ where }));
  informar(mCount, `${mCount.ultimo} productos`);

  const mPagina = await medir("findMany de 25 con sus relaciones", () =>
    prisma.productoBase.findMany({ where, skip: 0, take: 25, orderBy: { nombre: "asc" }, include: incluir })
  );
  informar(mPagina);

  const mMap = await medir("mergeBaseLocalToUi de la página", async () =>
    mPagina.ultimo.map((p) => mergeBaseLocalToUi(p, p.locales?.[0] ?? null))
  );
  informar(mMap);

  const totalListar =
    mAlCosto.mediana + mCount.mediana + mPagina.mediana + mMap.mediana;
  console.log(`  ${"TOTAL de la ruta".padEnd(46)} ${ms(totalListar).padStart(9)}`);
  console.log("");

  // ══ RUTA /api/productos/listar — CON control ══════════════════════════════
  //
  // Es el camino que se abre al tocar una card, y el que más productos toca:
  // "Precios +30 días" marca casi todo el catálogo mientras no haya revisiones.
  console.log(`/api/productos/listar?control=${CONTROL_A_MEDIR}  — al tocar una card`);

  const mCandidatos = await medir("traer candidatos para clasificar", () =>
    traerFilasParaControles(prisma, { where, localId })
  );
  informar(mCandidatos, `${mCandidatos.ultimo.filas.length} filas`);

  const mMarcar = await medir("filtrar los marcados en memoria", async () =>
    mCandidatos.ultimo.filas
      .filter((p) => filaMarcadaPor(CONTROL_A_MEDIR, p))
      .map((p) => p.id)
  );
  const ids = mMarcar.ultimo;
  informar(mMarcar, `${ids.length} marcados`);

  const whereConControl = { AND: [...where.AND, { id: { in: ids } }] };

  const mCountControl = await medir("count con el IN de los marcados", () =>
    prisma.productoBase.count({ where: whereConControl })
  );
  informar(mCountControl, `${mCountControl.ultimo} productos`);

  const mPaginaControl = await medir("findMany de 25 con el IN de los marcados", () =>
    prisma.productoBase.findMany({
      where: whereConControl,
      skip: 0,
      take: 25,
      orderBy: { nombre: "asc" },
      include: incluir,
    })
  );
  informar(mPaginaControl);

  const totalControl =
    mAlCosto.mediana +
    mCandidatos.mediana +
    mMarcar.mediana +
    mCountControl.mediana +
    mPaginaControl.mediana;
  console.log(`  ${"TOTAL de la ruta".padEnd(46)} ${ms(totalControl).padStart(9)}`);
  console.log("");

  // ── LO QUE LA PANTALLA ESPERA AL ABRIR ───────────────────────────────────
  //
  // Los dos pedidos salen juntos, así que el tiempo hasta que la pantalla está
  // completa es el del MÁS LENTO, no la suma — siempre que el servidor los
  // atienda en paralelo, que es lo que hay que comprobar aparte.
  console.log("Al abrir la pantalla salen los dos pedidos:");
  console.log(`  controles ${ms(totalControles)} · listar ${ms(totalListar)}`);
  console.log(`  el más lento manda: ${ms(Math.max(totalControles, totalListar))}`);
  console.log("");
  console.log("NO MEDIDO ACÁ: red, render del navegador, ni el costo de la sesión.");
  console.log("Esto es solo el trabajo de base de datos y de CPU del servidor.");
} finally {
  await prisma.$disconnect();
}
