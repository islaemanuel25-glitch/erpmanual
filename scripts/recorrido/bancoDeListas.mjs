// EL BANCO DE PRUEBA DEL MÓDULO DE LISTAS DE PROVEEDOR.
//
// Siembra un proveedor con un catálogo que tiene, a propósito, TODAS las trampas
// que aparecieron en producción — y arma los archivos de lista que las ejercen.
//
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/bancoDeListas.mjs --sembrar
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/bancoDeListas.mjs --limpiar
//
// ── POR QUÉ UN PROVEEDOR APARTE Y NO EL CATÁLOGO DE VERDAD ─────────────────
//
// Porque un recorrido tiene que poder AFIRMAR números: "esta lista deja 6 para
// revisar" solo sirve si se sabe cuáles y por qué. Sobre las 1.345 fichas reales
// los números se mueven con cada tanda y el arnés no podría distinguir un cambio
// legítimo de un defecto.
//
// Y porque el recorrido APLICA costos. Hacerlo sobre el catálogo real dejaría
// precios escritos que después hay que deshacer a mano; sobre el banco, `--limpiar`
// lo borra entero.
//
// Todo lo que siembra lleva el prefijo `ZZBP` en el nombre y cuelga de un
// proveedor propio, así que se reconoce de un vistazo y se borra por prefijo.
//
// ── LAS CUATRO LISTAS REALES ──────────────────────────────────────────────
//
// M Y F, DREAMCO, AASS y Distribuidora 22-9 ya están importadas en la base, y
// sus archivos originales están en la carpeta de subidas de la sesión. El banco
// los COPIA a su salida cuando los encuentra, para que el recorrido pueda
// subirlos de nuevo; si no están, lo dice y el recorrido usa lo que ya está
// conciliado, que es de solo lectura.
//
// Nota para quien lea el pedido: Emanuel las nombró "M Y F, Saldan, Dreamco,
// AASS". No hay ningún proveedor llamado Saldan en esta base — el cuarto es
// `Distribuidora 22-9` (id 5), cuyo archivo es `22_9.pdf`.
//
// Los archivos NO se versionan: son precios de compra del negocio. Ver
// `.gitignore` y `scripts/nadaDeDatosNiSecretos.test.mjs`.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
import { armarPdfFormaArcor } from "../lib/pdfFormaArcor.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const SALIDA = path.resolve(AQUI, "../../.banco-de-prueba");

/** Todo lo sembrado lleva esto. Es lo que hace que `--limpiar` sea exacto. */
export const MARCA = "ZZBP";
export const PROVEEDOR = `${MARCA} Banco de prueba`;
export const PROVEEDOR_PDF = `${MARCA} Arcor PDF`;

/** El rango del proveedor del banco. Todo lo demás se mide contra esto. */
export const RANGO = { minPct: 10, maxPct: 20 };

/**
 * EL CATÁLOGO, CON SUS TRAMPAS. Cada fila dice cuál es y qué tiene que pasar.
 *
 * `codigoGuardado` es el código del proveedor que queda vinculado al producto.
 * `codigoEnLaLista` es con qué código viene en el archivo. Cuando difieren, es
 * el caso del vínculo equivocado.
 *
 * `precioLista` es lo que dice el papel. El costo esperado sale de multiplicar
 * por el factor cuando el producto se compra por bulto.
 */
export const CATALOGO = [
  // ── 1. EL VÍNCULO EQUIVOCADO ────────────────────────────────────────────
  //
  // El caso MOGUL CONITOS: el producto tiene guardado el 13113, la lista trae un
  // 13113 que es OTRO producto, y el que le corresponde es el 3113. El macheo
  // hace lo correcto con lo que tiene; lo que está mal es el código guardado.
  {
    trampa: "VINCULO_EQUIVOCADO",
    nombre: `${MARCA} MOGUL CONITOS`,
    costo: 11049.39,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "13113",
    // No viene con su código: el 13113 de la lista es el otro producto.
    codigoEnLaLista: null,
    espera: "se machea al renglón 13113, que es otro producto; hay que corregirlo a mano al 3113",
  },
  {
    trampa: "VINCULO_EQUIVOCADO_EL_OTRO",
    nombre: `${MARCA} MOGUL GOMITAS 30G X 12`,
    costo: 5343.94,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: null, // sin vínculo: es el renglón que se roba el 13113
    codigoEnLaLista: null,
    espera: "queda sin producto hasta que alguien lo vincule",
  },

  // ── 2. POR CAJA Y POR UNIDAD ────────────────────────────────────────────
  {
    trampa: "POR_CAJA",
    nombre: `${MARCA} COFLER AIR BLANCO 27G`,
    costo: 35364.59, // caja de 20
    modo: "BULTO",
    factor: 20,
    codigoGuardado: "7742",
    codigoEnLaLista: "7742",
    precioLista: 2124.0, // × 20 = 42.480 → +20,1 %: apenas AFUERA del rango
    espera: "el precio se lee por caja (×20)",
  },
  {
    trampa: "POR_UNIDAD",
    nombre: `${MARCA} MERMELADA DURAZNO 454G`,
    costo: 2210.55,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "9155",
    codigoEnLaLista: "9155",
    precioLista: 2541.0, // +14,95 %: adentro del rango
    espera: "el precio se lee tal cual",
  },

  // ── 3. AUMENTOS: adentro, por debajo, por encima y absurdo ──────────────
  {
    trampa: "AUMENTO_EN_RANGO",
    nombre: `${MARCA} BON O BON LECHE 15G`,
    costo: 5120.44,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "7801",
    codigoEnLaLista: "7801",
    precioLista: 5888.51, // +15,0 %
    espera: "queda LISTO_PARA_ACTUALIZAR",
  },
  {
    trampa: "AUMENTO_POR_DEBAJO",
    nombre: `${MARCA} TOFI CHOCOLATE 18G`,
    costo: 3980.12,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "7810",
    codigoEnLaLista: "7810",
    precioLista: 4059.72, // +2,0 %: por debajo del 10
    espera: "para revisar, fuera de rango por abajo",
  },
  {
    trampa: "AUMENTO_POR_ENCIMA",
    nombre: `${MARCA} ARCOR ARVEJAS 350G`,
    costo: 742.3,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "9140",
    codigoEnLaLista: "9140",
    precioLista: 1039.22, // +40,0 %: por encima del 20
    espera: "para revisar, fuera de rango por arriba",
  },
  {
    trampa: "AUMENTO_ABSURDO",
    nombre: `${MARCA} POMAROLA TOMATE 340G`,
    costo: 966.94,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "9101",
    codigoEnLaLista: "9101",
    precioLista: 11603.28, // +1.100 %: absurdo
    espera: "para revisar; `esAbsurda` no lo deja ser la recomendada",
  },

  // ── 4. COSTO REDONDO SIN HISTORIAL ─────────────────────────────────────
  //
  // El caso de los TOSTEX de $1.000: un costo puesto para salir del paso, que
  // nadie escribió con una lista. La pantalla tiene que avisar antes de que
  // alguien calcule un porcentaje contra ese número.
  {
    trampa: "COSTO_REDONDO",
    nombre: `${MARCA} TOSTEX CLASICO`,
    costo: 1000.0,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "5001",
    codigoEnLaLista: "5001",
    precioLista: 1150.0, // +15 %: entra en rango, pero el costo es dudoso
    espera: "avisa «costo redondo sin historial» antes de dejar aplicar",
  },

  // ── 5. SIN COSTO ────────────────────────────────────────────────────────
  //
  // `precio_costo` es NOT NULL en el esquema, así que "sin costo" en este ERP
  // es el CERO. Lo dice la base, no una suposición: hay 18 productos en cero.
  {
    trampa: "SIN_COSTO",
    nombre: `${MARCA} PRODUCTO SIN COSTO`,
    costo: 0,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "5002",
    codigoEnLaLista: "5002",
    precioLista: 3300.0,
    espera: "INCONTROLABLE: no hay contra qué comparar, no se aplica nunca solo",
  },

  // ── 6. TUYO QUE NO VIENE EN LA LISTA ───────────────────────────────────
  {
    trampa: "NO_VINO",
    nombre: `${MARCA} CHOCOLATE QUE NO VINO`,
    costo: 4500.0,
    modo: "UNIDAD",
    factor: null,
    codigoGuardado: "5003",
    codigoEnLaLista: null, // no aparece en el archivo
    espera: "cuenta como «tuyo que no vino»",
  },
];

/**
 * RENGLONES DEL ARCHIVO QUE NO ESTÁN EN EL CATÁLOGO.
 *
 * Dos: el 13113 que se roba el vínculo del MOGUL CONITOS, y el 3113 que es el
 * que de verdad le corresponde. Los dos tienen que aparecer como "de la lista
 * que no tenés" hasta que alguien los vincule.
 */
export const SOLO_EN_LA_LISTA = [
  { codigo: "13113", descripcion: "MOGUL GOMITAS 30G X 12", um: "DI", cantidad: 12, precio: 5343.94 },
  { codigo: "3113", descripcion: "MOGUL x1 Kg CONITOS (450u)", um: "UN", cantidad: 6, precio: 12706.8 },
  { codigo: "3096", descripcion: "MOGUL x1 Kg ANILLOS (157u)", um: "UN", cantidad: 6, precio: 10578.0 },
];

/**
 * EL CÓDIGO REPETIDO CON DISTINTO PRECIO.
 *
 * El mismo código dos veces con precios distintos. No hay forma de saber cuál
 * rige, así que el motor lo marca y no lo aplica — aunque las dos filas se lean
 * perfecto.
 */
export const REPETIDO = {
  codigo: "9160",
  descripcion: "ACEITE GIRASOL 900ML",
  um: "BU",
  cantidad: 12,
  precios: [3055.8, 3510.0],
};

const num = (v) => Math.round(Number(v) * 100) / 100;

// ── LOS ARCHIVOS DE LISTA ──────────────────────────────────────────────────

/**
 * LAS FILAS DEL ARCHIVO DEL BANCO, en el orden en que salen impresas.
 *
 * `precioLista` del catálogo es el precio CON IVA: es la columna que tiene que
 * ganar la elección, porque es la que multiplicada por el factor da el costo. La
 * de sin IVA se deriva dividiendo por 1,21, así que el archivo trae las dos
 * columnas como el de Arcor y la elección de columna es una decisión de verdad y
 * no un trámite.
 */
export function filasDelArchivo() {
  const filas = [{ rubro: "GOLOSINAS" }];

  const producto = (codigo, desc, um, cant, conIva) => ({
    codigo,
    desc,
    um,
    cant,
    sinIva: Math.round((conIva / 1.21) * 100) / 100,
    conIva,
  });

  // Los renglones que NO están en el catálogo. Van primero porque el 13113 tiene
  // que estar antes que nada: es el que se roba el vínculo del MOGUL CONITOS.
  for (const r of SOLO_EN_LA_LISTA) {
    filas.push(producto(r.codigo, r.descripcion, r.um, r.cantidad, r.precio));
  }

  filas.push({ rubro: "CHOCOLATES" });
  for (const t of CATALOGO) {
    if (!t.codigoEnLaLista) continue; // el que no viene en la lista, no viene
    filas.push(
      producto(
        t.codigoEnLaLista,
        t.nombre.replace(`${MARCA} `, ""),
        // La unidad comercial del proveedor: BU el que viene por bulto, UN el
        // suelto. `CONFIG_ARCOR` solo admite UN, DI o BU, y la genérica no mira
        // la columna — pero escribir cualquier cosa acá haría que el archivo
        // dejara de tener la forma del real, que es lo único que prueba.
        t.modo === "BULTO" ? "BU" : "UN",
        t.factor ?? 12,
        t.precioLista
      )
    );
  }

  // EL CÓDIGO REPETIDO, con sus dos precios distintos. Va al final y en un rubro
  // aparte para que se vea que las dos filas son del mismo archivo.
  filas.push({ rubro: "ALIMENTOS" });
  for (const precio of REPETIDO.precios) {
    filas.push(producto(REPETIDO.codigo, REPETIDO.descripcion, REPETIDO.um, REPETIDO.cantidad, precio));
  }

  return filas;
}

/**
 * DÓNDE BUSCAR LAS CUATRO LISTAS REALES.
 *
 * Varias rutas y no una: la carpeta de subidas de la sesión cambia de nombre en
 * cada sesión, así que el banco prueba las que conoce y avisa cuál encontró. Se
 * puede pasar otra con `--reales <carpeta>`.
 */
const DONDE_ESTAN_LAS_REALES = [
  "/root/.claude/uploads",
  path.resolve(AQUI, "../../../erpazul-fixtures-dev"),
];

/** Los archivos reales, por el final de su nombre. */
const REALES = [
  { proveedor: "M Y F SRL", termina: "lista_3.pdf" },
  { proveedor: "DREAMCO", termina: "FOLDER_DREAMCO_TRADI_SEPTIEMBRE_26.pdf" },
  { proveedor: "AASS", termina: "LISTA_AASS_19-08.pdf" },
  { proveedor: "Distribuidora 22-9", termina: "22_9.pdf" },
  { proveedor: "Arcor", termina: ".xlsx" },
];

/** Recorre una carpeta ENTERA, no un nivel: las subidas cuelgan de subcarpetas. */
function archivosDe(raiz) {
  const salida = [];
  const bajar = (dir) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) bajar(completo);
      else salida.push(completo);
    }
  };
  bajar(raiz);
  return salida;
}

function copiarLasReales(destino, extra) {
  const candidatos = [...(extra ? [extra] : []), ...DONDE_ESTAN_LAS_REALES].flatMap(archivosDe);
  const copiadas = [];
  const faltan = [];

  for (const r of REALES) {
    const hallado = candidatos.find((c) => c.endsWith(r.termina));
    if (!hallado) {
      faltan.push(r.proveedor);
      continue;
    }
    const nombre = path.basename(hallado).replace(/^[0-9a-f]{8}-/, "");
    fs.copyFileSync(hallado, path.join(destino, nombre));
    copiadas.push({ proveedor: r.proveedor, archivo: nombre });
  }
  return { copiadas, faltan };
}

// ── LA SIEMBRA ─────────────────────────────────────────────────────────────

async function sembrar(db) {
  const grupo = await db.grupo.findFirst({ select: { id: true } });
  const deposito = await db.local.findFirst({ where: { es_deposito: true }, select: { id: true } });
  if (!grupo || !deposito) throw new Error("no hay grupo o depósito en esta base");

  console.log(`grupo ${grupo.id} · depósito ${deposito.id}`);

  // ── El proveedor del banco ────────────────────────────────────────────
  const prov = await db.proveedor.upsert({
    where: { id: (await db.proveedor.findFirst({ where: { nombre: PROVEEDOR } }))?.id ?? -1 },
    update: {
      listaAumentoEsperadoMinPct: RANGO.minPct,
      listaAumentoEsperadoMaxPct: RANGO.maxPct,
      listaRecargoPct: 0,
      listaImpuestoAdicionalPct: 0,
      listaImpuestosDefinidos: true,
      // Sin receta guardada: la primera lista pregunta por las columnas, que es
      // un paso del recorrido y no un estorbo.
      listaRecetaLectura: null,
      listaRecetaHuella: null,
      activo: true,
    },
    create: {
      // `Proveedor` NO tiene `grupoId`: es compartido entre grupos y lo que
      // lleva el grupo son las tablas que cuelgan de él. La visibilidad se
      // deriva de sus productos, y `creadoEnLocalId` es el respaldo de mientras
      // todavía no tiene ninguno.
      creadoEnLocalId: deposito.id,
      nombre: PROVEEDOR,
      activo: true,
      listaAumentoEsperadoMinPct: RANGO.minPct,
      listaAumentoEsperadoMaxPct: RANGO.maxPct,
      listaRecargoPct: 0,
      listaImpuestoAdicionalPct: 0,
      listaImpuestosDefinidos: true,
    },
    select: { id: true, nombre: true },
  });
  console.log(`proveedor: ${prov.nombre} (id ${prov.id})`);

  // El segundo, para el PDF de Arcor: sin parser propio, así que lo lee el
  // genérico. Arcor de verdad está en ARCOR_XLSX y RECHAZA un PDF —eso también
  // se comprueba en el recorrido, contra el proveedor real.
  const provPdf = await db.proveedor.upsert({
    where: { id: (await db.proveedor.findFirst({ where: { nombre: PROVEEDOR_PDF } }))?.id ?? -1 },
    update: { listaRecetaLectura: null, listaRecetaHuella: null, activo: true },
    create: {
      creadoEnLocalId: deposito.id,
      nombre: PROVEEDOR_PDF,
      activo: true,
      listaAumentoEsperadoMinPct: 5,
      listaAumentoEsperadoMaxPct: 25,
      listaRecargoPct: 0,
      listaImpuestoAdicionalPct: 0,
      listaImpuestosDefinidos: true,
    },
    select: { id: true, nombre: true },
  });
  console.log(`proveedor: ${provPdf.nombre} (id ${provPdf.id})`);

  // ── Los productos ─────────────────────────────────────────────────────
  let creados = 0;
  for (const t of CATALOGO) {
    const ya = await db.productoBase.findFirst({ where: { grupoId: grupo.id, nombre: t.nombre } });
    const datos = {
      grupoId: grupo.id,
      nombre: t.nombre,
      precio_costo: num(t.costo),
      precio_venta: num(t.costo * 1.5),
      unidad_medida: t.modo === "BULTO" ? "cajon" : "unidad",
      factor_pack: t.factor,
      modoCompraProveedor: t.modo,
      creadoEnLocalId: deposito.id,
      activo: true,
      es_combo: false,
      // `proveedor_id`, en snake, y no `proveedorId`: es el escalar del modelo.
      // Es además el campo que mira `productoDelProveedorWhere` —junto con
      // `proveedor2_id`— para decidir qué productos son de este proveedor.
      proveedor_id: prov.id,
    };
    const base = ya
      ? await db.productoBase.update({ where: { id: ya.id }, data: datos, select: { id: true } })
      : await db.productoBase.create({ data: datos, select: { id: true } });
    if (!ya) creados++;

    // La ficha del local: sin ella el producto no es visible desde el depósito.
    const yaLocal = await db.productoLocal.findFirst({
      where: { localId: deposito.id, baseId: base.id },
    });
    if (!yaLocal) {
      await db.productoLocal.create({ data: { localId: deposito.id, baseId: base.id, activo: true } });
    }

    // El vínculo con el código del proveedor, cuando lo tiene.
    if (t.codigoGuardado) {
      const yaCod = await db.productoCodigoProveedor.findFirst({
        where: { grupoId: grupo.id, proveedorId: prov.id, codigoInterno: t.codigoGuardado },
      });
      if (!yaCod) {
        await db.productoCodigoProveedor.create({
          data: {
            grupoId: grupo.id,
            proveedorId: prov.id,
            productoBaseId: base.id,
            codigoInterno: t.codigoGuardado,
            activo: true,
            origenAlta: "SIEMBRA_BANCO",
          },
        });
      } else {
        await db.productoCodigoProveedor.update({
          where: { id: yaCod.id },
          data: { productoBaseId: base.id, activo: true },
        });
      }
    }
  }
  console.log(`productos: ${CATALOGO.length} (${creados} nuevos)`);

  // ── LA MEMORIA ARRANCA LIMPIA ─────────────────────────────────────────
  //
  // Si quedara una lectura recordada o un "no lo cambio" de una corrida
  // anterior, el recorrido mediría la memoria en vez del camino, y lo peor es
  // que daría VERDE: las filas saldrían resueltas solas.
  const borradas = await db.lecturaProductoProveedor.deleteMany({
    where: { grupoId: grupo.id, proveedorId: prov.id },
  });
  const borradasNC = await db.productoQueNoSeCambia.deleteMany({
    where: { grupoId: grupo.id, proveedorId: prov.id },
  });
  console.log(`memoria limpia: ${borradas.count} lecturas, ${borradasNC.count} "no lo cambio"`);

  // ── Las importaciones anteriores del banco ────────────────────────────
  const viejas = await db.importacionListaProveedor.findMany({
    where: { proveedorId: { in: [prov.id, provPdf.id] } },
    select: { id: true },
  });
  if (viejas.length) {
    const ids = viejas.map((v) => v.id);
    await db.importacionListaFila.deleteMany({ where: { importacionId: { in: ids } } });
    await db.importacionListaProveedor.deleteMany({ where: { id: { in: ids } } });
    console.log(`importaciones anteriores del banco borradas: ${ids.length}`);
  }

  return { grupoId: grupo.id, proveedorId: prov.id, proveedorPdfId: provPdf.id, localId: deposito.id };
}

async function limpiar(db) {
  const grupo = await db.grupo.findFirst({ select: { id: true } });
  const provs = await db.proveedor.findMany({
    where: { nombre: { in: [PROVEEDOR, PROVEEDOR_PDF] } },
    select: { id: true },
  });
  const ids = provs.map((p) => p.id);

  if (ids.length) {
    const imps = await db.importacionListaProveedor.findMany({
      where: { proveedorId: { in: ids } },
      select: { id: true },
    });
    const impIds = imps.map((i) => i.id);
    if (impIds.length) {
      await db.importacionListaFila.deleteMany({ where: { importacionId: { in: impIds } } });
      await db.importacionListaProveedor.deleteMany({ where: { id: { in: impIds } } });
    }
    await db.productoQueNoSeCambia.deleteMany({ where: { proveedorId: { in: ids } } });
    await db.lecturaProductoProveedor.deleteMany({ where: { proveedorId: { in: ids } } });
    await db.productoCodigoProveedor.deleteMany({ where: { proveedorId: { in: ids } } });
    console.log(`importaciones y vínculos del banco: borrados`);
  }

  const bases = await db.productoBase.findMany({
    where: { grupoId: grupo.id, nombre: { startsWith: MARCA } },
    select: { id: true },
  });
  const baseIds = bases.map((b) => b.id);
  if (baseIds.length) {
    await db.productoLocal.deleteMany({ where: { baseId: { in: baseIds } } });
    await db.productoCodigoProveedor.deleteMany({ where: { productoBaseId: { in: baseIds } } });
    await db.productoBase.deleteMany({ where: { id: { in: baseIds } } });
  }
  console.log(`productos del banco borrados: ${baseIds.length}`);

  if (ids.length) await db.proveedor.deleteMany({ where: { id: { in: ids } } });
  console.log(`proveedores del banco borrados: ${ids.length}`);

  fs.rmSync(SALIDA, { recursive: true, force: true });
  console.log(`archivos borrados: ${SALIDA}`);
}

async function main() {
  const args = process.argv.slice(2);
  const db = await crearClientePrisma({ nivel: ESCRITURA });
  try {
    if (args.includes("--limpiar")) {
      await limpiar(db);
    } else if (args.includes("--sembrar")) {
      const ctx = await sembrar(db);
      fs.mkdirSync(SALIDA, { recursive: true });

      // ── EL ARCHIVO DEL BANCO ──────────────────────────────────────────
      const lista = path.join(SALIDA, "banco-lista.pdf");
      await armarPdfFormaArcor({
        filas: filasDelArchivo(),
        salida: lista,
        titulo: `${PROVEEDOR} - LISTA DE PRECIOS`,
      });
      console.log(`lista del banco: ${lista}`);

      // ── LAS CUATRO REALES, SI ESTÁN ───────────────────────────────────
      const i = args.indexOf("--reales");
      const { copiadas, faltan } = copiarLasReales(SALIDA, i >= 0 ? args[i + 1] : null);
      for (const c of copiadas) console.log(`lista real: ${c.proveedor} → ${c.archivo}`);
      if (faltan.length) console.log(`listas reales que NO se encontraron: ${faltan.join(", ")}`);

      ctx.lista = path.basename(lista);
      ctx.reales = copiadas;
      ctx.realesQueFaltan = faltan;
      fs.writeFileSync(path.join(SALIDA, "contexto.json"), JSON.stringify(ctx, null, 2));
      console.log(`\ncontexto escrito en ${path.join(SALIDA, "contexto.json")}`);
    } else {
      console.log("uso: bancoDeListas.mjs --sembrar | --limpiar");
      process.exitCode = 2;
    }
  } finally {
    await db.$disconnect();
  }
}

// Solo cuando se lo corre como programa: el arnés lo importa por sus constantes.
if (process.argv[1] && process.argv[1].endsWith("bancoDeListas.mjs")) {
  await main();
}
