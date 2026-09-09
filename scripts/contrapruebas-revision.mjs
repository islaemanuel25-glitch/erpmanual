// CONTRAPRUEBAS DE LOS SIETE DEFECTOS DE LA REVISIÓN.
//
// Un candado que nunca se vio en rojo no afirma nada: se ve igual que uno que
// acompaña. Acá se reintroduce cada defecto, uno por vez, sobre una COPIA
// descartable, y se exige que el candado que lo defiende se ponga rojo.
//
// Dos cuidados que ya se cobraron en este proyecto:
//
//  1. Se verifica que la inyección OCURRIÓ. Una vez se rompió un parámetro que
//     la función nunca reenviaba: el candado siguió verde y por un rato pareció
//     que el candado era flojo, cuando el flojo era el destrozo.
//  2. Se exige que el rojo sea el DEL CANDADO ESPERADO, por nombre. Un archivo
//     que deja de parsear pone todo rojo y eso no prueba nada.
//
//   node scripts/contrapruebas-revision.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ORIGEN = process.cwd();

const CASOS = [
  {
    n: 1,
    defecto: "desmarcar vuelve a pasar por el validador y reescribe el conteo",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    de: "      if (!revisado) {",
    a: "      if (false) {",
    candado: "1. desmarcar toca SOLO los tres campos de la revisión",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "1b",
    defecto: "la validación vuelve a partir de lo enviado y no de lo persistido",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    de: "          recibido: d.recibido,",
    a: "          recibido: body.recibido,",
    candado: "1b. y marcar con un cuerpo PARCIAL conserva lo persistido",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 2,
    defecto: "vuelve el stock del origen a la pantalla de recepción",
    archivo: "components/transferencias/AgregarProductoRecibido.jsx",
    de: "          <span className=\"font-mono\">{p.codigoBarra || \"Sin código\"}</span>",
    a: "          <span className=\"font-mono\">Stock origen {p.stockActual}</span>",
    candado: "2. la búsqueda de producto no declarado no muestra stock ni costo",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 3,
    defecto: "el catálogo del origen vuelve a estar disponible siempre",
    archivo: "components/transferencias/WorkspaceRecepcion.jsx",
    // El ancla es la del BOTÓN, no la del texto del aviso. Apuntarle al texto
    // fue lo que la primera corrida dejó pasar, y recortarla a la indentación
    // del botón no alcanzó: con ocho espacios el ancla vive DENTRO de la línea
    // de doce. Se ancla en la línea siguiente, que es la que la distingue.
    de: "MENSAJE_NO_FIGURA && puedeRecibir && (\n          <SunmiButton color=\"slate\"",
    a: "puedeRecibir && (\n          <SunmiButton color=\"slate\"",
    candado: "3. la acción del catálogo del origen solo existe tras no encontrar",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 4,
    defecto: "vuelve el copy que suena a agregarse mercadería",
    archivo: "components/transferencias/AgregarProductoRecibido.jsx",
    de: "export const ACCION_AGREGAR = \"Informar producto no declarado\";",
    a: "export const ACCION_AGREGAR = \"Agregar a recepción\";",
    candado: "4. el lenguaje es INFORMAR una inconsistencia, no agregarse mercadería",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 5,
    defecto: "el producto no declarado vuelve a inventar una categoría del remito",
    archivo: "lib/transferencias/controlFisico.js",
    de: "    if (d.agregadoEnRecepcion === true) continue;",
    a: "    if (false) continue;",
    candado: "5. un producto no declarado NO contamina las categorías del remito",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6",
    defecto: "la tabla histórica vuelve a restar en la escala del pack",
    archivo: "components/transferencias/TablaDetalleTransferencia.jsx",
    de: "    const diff = envFis == null || recFis == null ? null : recFis - envFis;",
    a: "    const diff = recibido == null ? null : recibido - enviada;",
    candado: "6. la tabla histórica mide la diferencia en FÍSICO",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6b",
    defecto: "el ajuste informativo del origen vuelve a ignorar las sueltas",
    archivo: "app/api/transferencias/detalle/route.js",
    de: "              recibidaSueltas: d.recibidoUnidadesSueltas,",
    a: "              recibidaSueltas: null,",
    candado: "6b. el endpoint de detalle pasa las sueltas al ajuste del origen",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6c",
    defecto: "el tile de diferencias vuelve a comparar cantidades de presentación",
    archivo: "app/modulos/transferencias/[id]/page.jsx",
    de: "    const e = estadoDeProducto({ ...d, revisadoEnRecepcion: true });",
    a: "    return num(d.cantidadRecibida) !== num(d.cantidadEnviada);",
    candado: "6c. el tile de la página cuenta diferencias con el MISMO estado que las cards",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "6e",
    defecto: "la valorización vuelve a ignorar las sueltas",
    archivo: "lib/transferencias/costoTransferencia.js",
    de: "  return rec + sueltas / f;",
    a: "  return rec;",
    candado: "6e. la VALORIZACIÓN incluye las sueltas, y esa división es de dinero",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: 7,
    defecto: "la recepción vuelve a tener su propia lista de códigos escaneables",
    archivo: "lib/transferencias/controlFisico.js",
    de: "  return codigosDeItem(d);",
    a: "  return [d.codigoBarraPropio, d.codigoBarra, d.codigoBarraSecundario].filter(Boolean);",
    candado: "7. los códigos escaneables salen de `codigosDeItem`, no de una lista propia",
    suite: "lib/transferencias/revisionSueltas.test.mjs",
  },
  {
    n: "24-25",
    defecto: "marcar deja de escribir la autoría",
    archivo: "app/api/transferencias/revisar-producto/route.js",
    de: "          revisadoEnRecepcionPorId: usuarioId,",
    a: "          revisadoEnRecepcionPorId: Number(body?.usuarioId || 0),",
    candado: "24-25. guardar un borrador NO marca revisado; revisar SÍ lo persiste",
    suite: "lib/transferencias/controlFisico.test.mjs",
  },
];

// `node_modules` se ENLAZA en vez de copiarse: son doce copias y nada de lo que
// se rompe a propósito vive ahí adentro. `.git` tampoco viaja.
const copiar = () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), "contra-"));
  for (const entrada of fs.readdirSync(ORIGEN)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    execFileSync("cp", ["-a", path.join(ORIGEN, entrada), destino]);
  }
  fs.symlinkSync(path.join(ORIGEN, "node_modules"), path.join(destino, "node_modules"));
  return destino;
};

const correr = (raiz, suite) => {
  try {
    return execFileSync(
      "node",
      ["--import", "./scripts/alias-loader.mjs", "--test", suite],
      { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
};

let fallas = 0;
for (const c of CASOS) {
  const raiz = copiar();
  const archivo = path.join(raiz, c.archivo);
  const antes = fs.readFileSync(archivo, "utf8");

  // 1. La inyección tiene que ocurrir de verdad, y una sola vez.
  const apariciones = antes.split(c.de).length - 1;
  if (apariciones !== 1) {
    console.log(`✗ ${c.n}  la inyección no aplica (${apariciones} coincidencias de la ancla)`);
    fallas++;
    fs.rmSync(raiz, { recursive: true, force: true });
    continue;
  }
  fs.writeFileSync(archivo, antes.replace(c.de, c.a));

  // 2. El candado esperado tiene que ponerse rojo, POR SU NOMBRE.
  const salida = correr(raiz, c.suite);
  const rojoEsperado = salida.includes(`not ok`) && salida.includes(c.candado)
    && new RegExp(`not ok \\d+ - ${c.candado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(salida);

  // 3. Y el archivo tiene que seguir parseando: un rojo por sintaxis rota no
  //    prueba que el candado mire nada.
  const explotoTodo = /Cannot find module|SyntaxError/.test(salida);

  if (rojoEsperado && !explotoTodo) {
    console.log(`✓ ${c.n}  ${c.defecto} → ROJO en «${c.candado}»`);
  } else {
    console.log(`✗ ${c.n}  ${c.defecto} → el candado NO se puso rojo`);
    if (explotoTodo) console.log("     (el módulo no cargó: el rojo no vale)");
    fallas++;
  }
  fs.rmSync(raiz, { recursive: true, force: true });
}

console.log(fallas === 0 ? `\n${CASOS.length}/${CASOS.length} contrapruebas en rojo, como corresponde` : `\n${fallas} contrapruebas NO probaron nada`);
process.exit(fallas === 0 ? 0 : 1);
