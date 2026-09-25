// CONTRAPRUEBAS CONTRA POSTGRES DE LOS DOS DEFECTOS QUE VIVEN EN LA BASE.
//
// Las contrapruebas de `scripts/contrapruebas-revision.mjs` rompen y miran
// candados de texto. Estas dos rompen y miran DATOS: se reintroduce el defecto,
// se corre la suite de recepción de verdad contra Postgres, y se exige que las
// afirmaciones que lo cubren se pongan rojas.
//
// Se corre con la misma DATABASE_URL que la suite:
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/contrapruebasRevision.mjs
//
// Cada caso arranca de un esquema limpio, porque la suite monta y desmonta sus
// propios datos y dos corridas encimadas se estorban.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ORIGEN = process.cwd();

const CASOS = [
  {
    n: 1,
    defecto: "desmarcar vuelve a pasar por el validador y usa el fallback de lo enviado",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    // ── HAY QUE ROMPER LAS DOS MITADES, Y ESO SE APRENDIÓ ACÁ ──────────────
    //
    // El arreglo del defecto 1 tiene dos partes: el camino propio de desmarcar,
    // y que la validación parta de lo PERSISTIDO. La primera versión de esta
    // contraprueba rompía solo la primera y la suite se quedaba verde — porque
    // la segunda alcanza sola para que el conteo sobreviva.
    //
    // Eso no era un candado flojo: es que las dos mitades se tapan entre sí, y
    // cualquiera de las dos sostiene el dato. Para volver al defecto de verdad
    // —"desmarcar usa el fallback de lo enviado"— hay que sacar las dos.
    inyecciones: [
      { de: "      if (!revisado) {", a: "      if (false) {" },
      { de: "          recibido: d.recibido,", a: "          recibido: undefined," },
      {
        de: "          recibidoUnidadesSueltas: d.recibidoUnidadesSueltas,",
        a: "          recibidoUnidadesSueltas: undefined,",
      },
    ],
    // Lo que tiene que gritar: el conteo de 5 bultos y 5 sueltas volviendo a
    // 6 y 0 por tocar "desmarcar".
    esperadas: [
      "H · el recibido SIGUE en 5",
      "H · las sueltas SIGUEN en 5",
    ],
  },
  {
    n: 6,
    defecto: "el ajuste informativo del origen vuelve a ignorar las sueltas",
    archivo: "app/api/transferencias/detalle/route.js",
    inyecciones: [
      {
        de: "              recibidaSueltas: d.recibidoUnidadesSueltas,",
        a: "              recibidaSueltas: null,",
      },
    ],
    esperadas: [
      "I.2 · al origen se le devuelve 1, no 6",
    ],
  },
  // ── LOS TRES DE LA SEGUNDA REVISIÓN (2026-09-09) ────────────────────────
  //
  // El del dirty fantasma NO se puede probar con un helper suelto: la sección J
  // recorre el camino real —abrir, revisar contra el endpoint, recargar por el
  // endpoint de detalle, reconciliar, confirmar— y es esa juntura la que lo
  // producía. Acá se reintroduce la preservación legacy y esa sección tiene que
  // gritar.
  {
    n: "I-1",
    defecto: "vuelve la preservación legacy después de una revisión con diferencia",
    archivo: "lib/transferencias/recepcionUI.js",
    inyecciones: [
      {
        de: "  const conservar = modo === MODO_RECEPCION.EDITOR_LOTES && preservar === true;",
        a: "  const conservar = preservar === true;",
      },
    ],
    esperadas: [
      "J · NO queda dirty fantasma",
      "J · y editItems refleja lo guardado, no la propuesta vieja",
    ],
  },
  {
    n: "I-2",
    defecto: "el chip de categoría del remito vuelve a filtrar los no declarados",
    archivo: "lib/transferencias/controlFisico.js",
    inyecciones: [
      { de: "  if (categoriaId && !filtraNoDeclarados) {", a: "  if (categoriaId) {" },
    ],
    esperadas: [
      "K · y con el chip del remito activo la lista muestra 1, no 0",
    ],
  },
  {
    n: "I-3",
    defecto: "Enter vuelve a ser siempre un escaneo",
    archivo: "lib/transferencias/controlFisico.js",
    inyecciones: [
      { de: "  if (porTexto.length === 1) {", a: "  if (false) {" },
    ],
    esperadas: [
      "L · una sola coincidencia por nombre abre",
    ],
  },
  // ── LO QUE UNA COMPRA SUMÓ AL STOCK, CONGELADO (Finanzas 1.b) ─────────────
  //
  // Corren contra `recepcionCompras.mjs`, que compara en cada caso el delta
  // real de `StockLocal` contra lo congelado. Por eso rompen DATOS y no texto:
  // la contraprueba de texto del mismo defecto está en
  // `scripts/contrapruebas-revision.mjs` (SI-1 a SI-3).
  {
    n: "SI-1",
    defecto: "el cierre vuelve a congelar `cantidadRecibida × factor_pack` en vez de lo que sumó",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      {
        de: "          stockIngresado: incremento,",
        a: "          stockIngresado: cantRecibida * Math.max(1, Number(base?.factor_pack || 1)),",
      },
    ],
    // Donde esa cuenta no es lo que entró: el pack con sueltas (72 contra 77),
    // los kilos y el fiambre del local. Donde coincide —10 bultos de 12— no
    // grita, y está bien: ahí la cuenta vieja todavía no miente.
    esperadas: [
      "PACK con sueltas: stockIngresado es lo que sumó el stock",
      "KG pesado: stockIngresado es lo que sumó el stock",
      "PIEZA en local: stockIngresado es lo que sumó el stock",
    ],
  },
  {
    n: "SI-2",
    defecto: "la unidad deja de salir del destino real y se toma como si todo fuera el depósito",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      {
        de: "unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito });",
        a: "unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito: true });",
      },
    ],
    esperadas: [
      "PIEZA en local: la unidad es KG",
      "el mismo producto congeló dos unidades distintas, porque entró distinto",
    ],
  },
  {
    n: "SI-3",
    defecto: "una línea que no sumó nada queda en NULL en vez de 0 con su unidad",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/recepcionCompras.mjs",
    minimo: 60,
    inyecciones: [
      { de: "            detCero.stockIngresado = 0;\n", a: "" },
      { de: "            detCero.stockIngresadoUnidad = unidadIngreso;\n", a: "" },
    ],
    esperadas: [
      "cero declarado: 0 UNIDAD y cantidadRecibida 0",
      "sin declarar: 0 UNIDAD, y cantidadRecibida sigue en null (nadie contó)",
    ],
  },
  // ── EL FRENO DE COSTO DE LA RECEPCIÓN ──────────────────────────────────
  //
  // Corren contra `frenoDeCosto.mjs`, que cierra por la ruta real con un costo
  // maestro distinto de cero y mira qué quedó escrito. El defecto que las trajo
  // no lo veía ningún candado de texto: el cierre LEÍA `base?.precio_costo`,
  // pero el `select` no lo traía.
  //
  // El piso es 20 y no más: la suite tiene 60 afirmaciones y sacar el costo
  // maestro apaga el freno entero, así que en FC-1 caen 23 a la vez y quedan
  // 37 en verde. El piso está para distinguir "abortó al montar" —cero— de
  // "corrió y gritó", no para contar cuánto grita.
  {
    n: "FC-1",
    defecto: "el select de la base vuelve a no traer precio_costo",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "                    precio_costo: true,\n", a: "" }],
    esperadas: [
      "A: frena con 409",
      "F costo del bulto en línea UNIDAD: el costo maestro queda en 61703",
    ],
  },
  {
    n: "FC-2",
    defecto: "el cierre ignora la aceptación que la hoja de Corregir dejó guardada",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "const aceptada = costosAceptados.has(det.id) || aceptadoEnElPapel(det.id, costoFinal);",
        a: "const aceptada = costosAceptados.has(det.id);",
      },
    ],
    esperadas: ["C: cierra", "C: el costo maestro queda en 1150"],
  },
  {
    n: "FC-3",
    defecto: "el freno vuelve a correr sobre una línea excluida del costo",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [
      {
        de: "if (escribeCosto && sugerida.exigeElegir && !aceptada) {",
        a: "if (sugerida.exigeElegir && !aceptada) {",
      },
    ],
    esperadas: ["I: cierra"],
  },
  {
    n: "FC-4",
    defecto: "la conversión vuelve a multiplicar por 30 el costo del bulto de la hamburguesa",
    archivo: "app/api/compras-proveedor/recibir/[id]/route.js",
    suite: "scripts/pruebas-db/frenoDeCosto.mjs",
    minimo: 20,
    inyecciones: [{ de: "          costoActual: base?.precio_costo ?? null,", a: "          costoActual: null," }],
    // Sin el costo actual, la línea UNIDAD se multiplica por 30 y el freno la
    // para como error de escala: el cierre legítimo deja de cerrar.
    esperadas: ["F costo del bulto en línea UNIDAD: cierra"],
  },
];

// Sin argumento corren todos. Con un prefijo —`SI-`— solo los casos cuyo número
// empieza así: es lo que usa el CI, que no tiene por qué pagar los minutos de
// la suite de transferencias para probar la de compras.
const PREFIJO = process.argv[2] || "";
const ELEGIDOS = CASOS.filter((c) => String(c.n).startsWith(PREFIJO));
if (ELEGIDOS.length === 0) {
  console.log(`✗ ningún caso empieza con «${PREFIJO}»: no se probó nada`);
  process.exit(1);
}

// `node_modules` se ENLAZA, no se copia. Copiarlo entero daba un árbol a medias
// —`next/server` dejaba de resolver, con un mensaje que apuntaba a otro lado— y
// además tarda. Enlazado, la resolución sube desde la copia, encuentra el enlace
// y entra al mismo árbol de siempre. Nada de lo que se rompe a propósito vive
// ahí adentro.
const copiar = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), "contra-db-"));
  for (const entrada of fs.readdirSync(ORIGEN)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    execFileSync("cp", ["-a", path.join(ORIGEN, entrada), destino]);
  }
  fs.symlinkSync(path.join(ORIGEN, "node_modules"), path.join(destino, "node_modules"));
  return destino;
};

/**
 * El entorno del hijo, SIN la marca de registro del cargador de alias.
 *
 * `scripts/alias-loader.mjs` se protege de registrarse en cadena con
 * `__ERPAZUL_ALIAS_LOADER__` en el entorno. Este script corre con el cargador
 * puesto, así que la marca ya está — y heredarla hacía que el hijo importara el
 * cargador y NO lo registrara. El síntoma no se parecía en nada a la causa:
 * `next/server` dejaba de resolver y el mensaje culpaba a `node_modules`, que
 * estaba perfecto.
 */
const entornoHijo = () => {
  const env = { ...process.env };
  delete env.__ERPAZUL_ALIAS_LOADER__;
  return env;
};

let fallas = 0;
for (const c of ELEGIDOS) {
  const raiz = copiar();
  const archivo = path.join(raiz, c.archivo);
  let texto = fs.readFileSync(archivo, "utf8");

  // Cada inyección tiene que aplicar, y una sola vez. Un ancla que no engancha
  // deja el archivo sano y la suite verde, y eso se lee como "el candado no
  // sirve" cuando lo que no sirvió fue el destrozo.
  let ancladas = true;
  for (const iny of c.inyecciones) {
    const apariciones = texto.split(iny.de).length - 1;
    if (apariciones !== 1) {
      console.log(`✗ ${c.n}  una inyección no aplica (${apariciones} coincidencias de «${iny.de.trim()}»)`);
      ancladas = false;
      break;
    }
    texto = texto.replace(iny.de, iny.a);
  }
  if (!ancladas) {
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }
  fs.writeFileSync(archivo, texto);

  let salida = "";
  try {
    salida = execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", c.suite || "scripts/pruebas-db/recepcionTransferencias.mjs"],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: entornoHijo() }
    );
  } catch (e) {
    salida = `${e.stdout || ""}${e.stderr || ""}`;
  }

  // Que la suite haya CORRIDO: si abortó al montar, el rojo no prueba nada.
  const corrio = /Afirmaciones que pasaron: (\d+)/.exec(salida);
  const pasadas = corrio ? Number(corrio[1]) : 0;
  // El piso es de cada suite: la de compras tiene menos afirmaciones que la de
  // transferencias, y un piso de 100 la daría siempre por no corrida.
  if (pasadas < (c.minimo ?? 100)) {
    console.log(`✗ ${c.n}  la suite no llegó a correr (${pasadas} afirmaciones): el rojo no vale`);
    console.log(salida.split("\n").slice(0, 12).map((l) => `     | ${l}`).join("\n"));
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }

  const faltantes = c.esperadas.filter((t) => !salida.includes(`✗ [`) || !salida.includes(t + " —"));
  if (faltantes.length === 0) {
    console.log(`✓ ${c.n}  ${c.defecto} → ROJO en: ${c.esperadas.join(" · ")}`);
  } else {
    console.log(`✗ ${c.n}  ${c.defecto} → NO se pusieron rojas: ${faltantes.join(" · ")}`);
    fallas++;
  }
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(fallas === 0
  ? `\n${ELEGIDOS.length}/${ELEGIDOS.length} contrapruebas de base en rojo, como corresponde`
  : `\n${fallas} contrapruebas de base NO probaron nada`);
process.exit(fallas === 0 ? 0 : 1);
