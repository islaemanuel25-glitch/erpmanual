// lib/ventas-internas/avisoVentaInterna.test.mjs
//
// Etapa 4B: aviso de venta interna en el POS. El proyecto no tiene infraestructura
// de renderizado, así que la REGLA se testea sobre el helper puro y el CABLEADO
// (endpoint, componente, ubicación, ausencia de estado paralelo) sobre el fuente.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  obtenerAvisoVentaInterna,
  VARIANTES,
  MOTIVOS_OCULTO,
} from "./avisoVentaInterna.js";
import { esComentario } from "../hardcodeo/contador.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

const RUTA_BUSCAR = leer("app", "api", "clientes", "buscar", "route.js");
const PAGINA_POS = leer("app", "modulos", "pos-ventas", "page.jsx");
const COMPONENTE = leer("components", "pos-ventas", "AvisoVentaInterna.jsx");
const HELPER = leer("lib", "ventas-internas", "avisoVentaInterna.js");

// Se usa hasOwnProperty, no `=== undefined`: hay que poder pedir explícitamente
// `local: undefined` (el caso "vino el id pero no el objeto") sin que el helper lo
// reemplace por el default.
const dado = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const interno = (o = {}) => ({
  id: 90,
  nombre: "Minimarket casiano",
  localId: 1,
  localVinculadoId: dado(o, "vinculadoId") ? o.vinculadoId : 7,
  localVinculado: dado(o, "local") ? o.local : { id: 7, nombre: "Mini 7", activo: true },
});

// ══ 1. API DE CLIENTES ════════════════════════════════════════════════════════

test("1 y 2. buscar incluye el vínculo con id, nombre y activo", () => {
  assert.match(
    RUTA_BUSCAR,
    /localVinculado: \{\s*select: \{ id: true, nombre: true, activo: true \},?\s*\}/,
    "el include debe traer el local vinculado"
  );
  // localVinculadoId viaja solo: findMany devuelve todos los escalares del modelo.
  assert.equal(/select:\s*\{[^}]*\bid:\s*true[^}]*\}\s*,?\s*\n\s*\}\);/.test(RUTA_BUSCAR), false,
    "la consulta usa include, no un select que recorte los escalares");
  assert.match(RUTA_BUSCAR, /prisma\.cliente\.findMany\(\{[\s\S]*?include:/);
});

test("3. no expone datos innecesarios del LOCAL vinculado", () => {
  const bloque = RUTA_BUSCAR.match(/localVinculado: \{[\s\S]*?\},/)[0];
  for (const campo of ["direccion", "telefono", "email", "cuil", "es_deposito", "aparienciaJson"]) {
    assert.equal(bloque.includes(campo), false, `localVinculado no debe traer ${campo}`);
  }
});

test("4 y 5. el scope, los filtros y el orden no cambiaron", () => {
  assert.match(RUTA_BUSCAR, /resolveGrupo\(req, false\)/);
  assert.match(RUTA_BUSCAR, /const where = \{\s*grupoId,\s*activo: true,/);
  assert.match(RUTA_BUSCAR, /if \(localId\) \{\s*where\.localId = localId;/);
  assert.match(RUTA_BUSCAR, /take: 20/);
  assert.match(RUTA_BUSCAR, /orderBy: \{ nombre: "asc" \}/);
  assert.match(RUTA_BUSCAR, /q\.length < 2/);
  // La forma de la respuesta sigue igual.
  assert.match(RUTA_BUSCAR, /\{ ok: true, items: clientes \}/);
});

// Los archivos que consumen el endpoint, SACADOS DEL REPO y no de una lista
// escrita a mano.
//
// ── POR QUÉ SE DERIVA, Y POR QUÉ ADEMÁS SE EXIGE QUE ESTÉN VIVOS ────────────
//
// La lista estaba escrita a mano y nombraba `components/pos-ventas/ModalCliente.jsx`
// como "consumidor existente". **No lo renderiza nadie desde el 2026-02-15**, el
// día que el POS lo reemplazó por `ClientePickerFullscreen` (`e854077`). Este
// candado se escribió el 2026-07-30: nació apuntando a un archivo muerto y pasó
// en verde desde entonces, afirmando cosas sobre algo que ninguna pantalla
// dibuja.
//
// Derivar la lista sola NO alcanzaría: el muerto también contiene la cadena, así
// que un `grep` lo volvería a incluir. Por eso el candado hace las DOS cosas —
// enumera desde el repo y exige que cada uno sea ALCANZABLE—, y un consumidor
// que se queda sin quien lo importe cae en rojo en vez de quedarse guardado.
//
// Se busca por RUTA de módulo y no por nombre: hay dos `ModalCliente` distintos
// en el repo y uno está definido adentro de `app/modulos/clientes/page.jsx`.
// Buscar por nombre los confundiría, que es la mitad de cómo se armó este lío.
const ARCHIVOS = execSync("git ls-files app components lib hooks", {
  cwd: RAIZ,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.(js|jsx|mjs)$/.test(f));

const CONSUMIDORES = ARCHIVOS.filter(
  (f) => !f.endsWith(".test.mjs") && leer(f).includes("clientes/buscar")
);

// QUIÉN CUENTA COMO IMPORTADOR, y las dos exclusiones no son detalles:
//
//   · Un TEST no renderiza nada. Un candado que lee un archivo no lo pone en
//     ninguna pantalla, así que contarlo como importador haría que el archivo
//     muerto se sostenga solo del candado que lo guarda — un círculo perfecto.
//   · Un COMENTARIO tampoco. La primera versión de este candado pasó en verde
//     porque el comentario de acá arriba NOMBRA la ruta del archivo muerto para
//     explicar el caso. Reescribir el comentario para esquivarlo es un hábito;
//     lo que se arregla es la pregunta. `esComentario` sale del contador, que es
//     donde vive esa regla.
function loImportaAlguien(ruta) {
  const sinExt = ruta.replace(/\.(js|jsx|mjs)$/, "");
  const base = sinExt.split("/").pop();
  const carpeta = sinExt.slice(0, sinExt.lastIndexOf("/"));
  return ARCHIVOS.some((otro) => {
    if (otro === ruta || otro.endsWith(".test.mjs")) return false;
    const src = leer(otro)
      .split("\n")
      .filter((l) => !esComentario(l))
      .join("\n");
    // Por ruta absoluta del alias, que es como los escribe el repo…
    if (src.includes(sinExt)) return true;
    // …y por import relativo, solo desde la misma carpeta.
    return otro.startsWith(carpeta + "/") && new RegExp(`["'][./]*${base}["']`).test(src);
  });
}

test("6. los consumidores existentes toleran las dos propiedades nuevas", () => {
  // Ninguno compara la forma exacta ni reenvía el objeto entero a un create:
  // todos leen campos puntuales de `items`.
  assert.ok(CONSUMIDORES.length >= 4, `enumeró ${CONSUMIDORES.length}: revisar el criterio`);
  for (const c of CONSUMIDORES) {
    const src = leer(c);
    assert.match(src, /clientes\/buscar/, `${c} debe seguir consumiendo el endpoint`);
    // Nada de Object.keys/JSON.stringify sobre los items: eso sí rompería.
    assert.equal(/Object\.keys\(\s*(cli|c|item|data\.items)/.test(src), false,
      `${c} no debe inspeccionar la forma exacta`);
  }
});

test("6.bis NINGÚN CONSUMIDOR ES CÓDIGO MUERTO", () => {
  // Un candado que lee un archivo sigue pasando cuando el archivo deja de
  // renderizarse: no afirma nada y no se queja. Acá se queja.
  const muertos = CONSUMIDORES.filter((c) => !c.startsWith("app/") && !loImportaAlguien(c));
  assert.deepEqual(
    muertos,
    [],
    `estos archivos consumen el endpoint y NO LOS IMPORTA NADIE, así que este ` +
      `candado los está guardando sin que ninguna pantalla los dibuje: ${muertos.join(", ")}`
  );
});

// ══ 2. LA REGLA (helper puro) ═════════════════════════════════════════════════

test("7. cliente común → no muestra nada", () => {
  for (const c of [
    { id: 1, nombre: "Juan" },
    { id: 1, nombre: "Juan", localVinculadoId: null },
    { id: 1, nombre: "Juan", localVinculadoId: 0 },
    { id: 1, nombre: "Juan", localVinculadoId: "" },
  ]) {
    const a = obtenerAvisoVentaInterna(c);
    assert.equal(a.visible, false);
    assert.equal(a.motivo, MOTIVOS_OCULTO.CLIENTE_EXTERNO);
    assert.equal(a.mensaje, null);
  }
});

test("8. cliente interno → aviso con el nombre del local", () => {
  const a = obtenerAvisoVentaInterna(interno());
  assert.equal(a.visible, true);
  assert.equal(a.variante, VARIANTES.INTERNA);
  assert.equal(a.titulo, "Venta interna");
  assert.equal(a.mensaje, "Esta venta generará una transferencia de mercadería al local Mini 7.");
  assert.equal(a.localNombre, "Mini 7");
});

test("9. local vinculado inactivo → aviso de rechazo, más fuerte", () => {
  const a = obtenerAvisoVentaInterna(interno({ local: { id: 7, nombre: "Mini 7", activo: false } }));
  assert.equal(a.visible, true);
  assert.equal(a.variante, VARIANTES.DESTINO_INACTIVO);
  assert.equal(a.titulo, "Local interno inactivo");
  assert.match(a.mensaje, /está inactivo\. La venta será rechazada\./);
  // `activo` ausente o no booleano también cuenta como inactivo (fail-closed).
  for (const act of [undefined, null, 0, "true"]) {
    const r = obtenerAvisoVentaInterna(interno({ local: { id: 7, nombre: "M", activo: act } }));
    assert.equal(r.variante, VARIANTES.DESTINO_INACTIVO, `activo=${JSON.stringify(act)}`);
  }
});

test("10. sin cliente → no muestra nada", () => {
  for (const c of [null, undefined, "", 0, "Juan", 5]) {
    const a = obtenerAvisoVentaInterna(c);
    assert.equal(a.visible, false);
    assert.equal(a.motivo, MOTIVOS_OCULTO.SIN_CLIENTE);
  }
  assert.equal(obtenerAvisoVentaInterna().visible, false);
});

test("11. cambiar de interno a externo lo hace desaparecer", () => {
  assert.equal(obtenerAvisoVentaInterna(interno()).visible, true);
  assert.equal(obtenerAvisoVentaInterna({ id: 2, nombre: "Externo" }).visible, false);
});

test("12. no infiere por nombre", () => {
  // El cliente se llama igual que un local y NO tiene vínculo: no se muestra nada.
  const a = obtenerAvisoVentaInterna({ id: 1, nombre: "Mini 7", localVinculadoId: null });
  assert.equal(a.visible, false);
  // Y el helper ni siquiera lee `nombre` del cliente.
  const codigo = HELPER.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/cliente\.nombre/.test(codigo), false);
});

test("13. no usa Cliente.localId", () => {
  const codigo = HELPER.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/cliente\.localId/.test(codigo), false);
  // Un cliente cuya ficha vive en otro local se decide igual, solo por el vínculo.
  const a = obtenerAvisoVentaInterna(interno({ }));
  assert.equal(a.localNombre, "Mini 7");
  const b = obtenerAvisoVentaInterna({ ...interno(), localId: 99 });
  assert.deepEqual(b, a, "localId no cambia nada");
});

test("vínculo declarado pero sin datos del local → no inventa destino", () => {
  for (const local of [null, undefined, {}, { id: 0 }, { nombre: "X" }]) {
    const a = obtenerAvisoVentaInterna(interno({ local }));
    assert.equal(a.visible, false, `local=${JSON.stringify(local)}`);
    assert.equal(a.motivo, MOTIVOS_OCULTO.VINCULO_SIN_DATOS);
    assert.equal(a.localNombre, null);
  }
});

test("local sin nombre cae a un rótulo neutro, no a un id pelado", () => {
  const a = obtenerAvisoVentaInterna(interno({ local: { id: 7, activo: true } }));
  assert.equal(a.localNombre, "Local 7");
  assert.match(a.mensaje, /al local Local 7\./);
});

test("no muta el cliente que recibe", () => {
  const c = interno();
  const antes = JSON.stringify(c);
  obtenerAvisoVentaInterna(c);
  assert.equal(JSON.stringify(c), antes);
});

// ══ 3. CABLEADO EN EL POS ═════════════════════════════════════════════════════

test("14. no crea estado paralelo: se alimenta del cliente que ya existe", () => {
  assert.match(PAGINA_POS, /<AvisoVentaInterna cliente=\{state\.clienteSeleccionado\} \/>/);
  // No hay un segundo estado con el vínculo.
  const codigo = PAGINA_POS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/useState\([^)]*[Vv]inculad/.test(codigo), false);
  assert.equal(/setLocalVinculado|localVinculadoId:\s*use/.test(codigo), false);
  // El reducer tampoco guarda nada nuevo.
  const reducer = leer("app", "modulos", "pos-ventas", "reducer", "posVentaReducer.js");
  assert.equal(/[Vv]inculad/.test(reducer), false, "el reducer no debe conocer el vínculo");
});

test("15. un solo componente para móvil y escritorio, fuera del split lg:", () => {
  const iAviso = PAGINA_POS.indexOf("<AvisoVentaInterna");
  const iCredito = PAGINA_POS.indexOf("Info crédito cliente (fiado)");
  const iSplit = PAGINA_POS.indexOf("flex-1 flex flex-col lg:flex-row");
  assert.ok(iAviso > 0, "debe estar renderizado");
  assert.ok(iAviso < iCredito, "va antes del panel de crédito");
  assert.ok(iAviso < iSplit, "y ANTES del split lg:, así se ve igual en móvil");
  // Aparece UNA sola vez: nada de duplicarlo en el modal de clientes.
  assert.equal((PAGINA_POS.match(/<AvisoVentaInterna/g) || []).length, 1);
  // `ModalCliente.jsx` estaba en esta lista y se borró: no lo renderizaba nadie
  // desde el 2026-02-15, cuando el POS lo reemplazó por
  // `ClientePickerFullscreen`. El que lo destapó fue el candado 6.bis.
  for (const c of ["ClientePickerFullscreen.jsx", "CarritoVenta.jsx", "FormaPago.jsx"]) {
    assert.equal(leer("components", "pos-ventas", c).includes("AvisoVentaInterna"), false,
      `${c} no debe renderizar el aviso`);
  }
});

test("el componente no hardcodea colores ni consulta APIs", () => {
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(COMPONENTE), false, "sin hex hardcodeado");
  assert.equal(/fetch\(|useEffect|useState/.test(COMPONENTE), false,
    "es presentacional: sin fetch ni estado propio");
  // Usa las clases del sistema del POS.
  assert.match(COMPONENTE, /sunmi-pos-panel/);
  assert.match(COMPONENTE, /sunmi-pos-text-danger/);
  assert.match(COMPONENTE, /sunmi-pos-text-accent/);
  // Y no inventa una librería de íconos nueva.
  assert.match(COMPONENTE, /from "lucide-react"/);
});

test("el helper es puro: sin Prisma, sin Next, sin fetch", () => {
  const imports = [...HELPER.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], "el helper no importa nada");
  for (const p of ["prisma", "next/", "fetch(", "NextResponse"]) {
    assert.equal(HELPER.includes(p), false, `no debe mencionar "${p}"`);
  }
});

// ══ 4. REGRESIÓN: NADA DEL BACKEND CAMBIÓ ═════════════════════════════════════

test("16. el payload de venta sigue sin mandar destino ni datos de transferencia", () => {
  const payload = leer("lib", "pos-ventas", "payloadVenta.js");
  for (const prohibido of [
    "localVinculado", "destinoId", "transferencia", "ventaInterna", "localDestino",
  ]) {
    assert.equal(payload.includes(prohibido), false, `payloadVenta no debe mencionar ${prohibido}`);
  }
  // Y el body que arma el POS tampoco.
  const cuerpos = [...PAGINA_POS.matchAll(/clienteId: state\.clienteSeleccionado\?\.id \|\| null,[\s\S]{0,400}/g)];
  assert.ok(cuerpos.length >= 1);
  for (const [c] of cuerpos) {
    assert.equal(/localVinculado|destinoId|transferencia/.test(c), false,
      "el body de la venta solo manda clienteId; el backend resuelve el resto");
  }
});

test("17-20. backend de creación, mapper y transferencias intactos", () => {
  // Esta etapa es frontend + un include. Nada del núcleo cambió.
  const crear = leer("app", "api", "pos-ventas", "crear", "route.js");
  assert.equal(crear.includes("AvisoVentaInterna"), false);
  assert.equal(crear.includes("avisoVentaInterna"), false);
  // Sigue resolviendo el vínculo por su cuenta, desde la base: previa con
  // `prisma` y definitiva con `tx` (etapa 4C).
  assert.match(crear, /resolverVentaInterna\(prisma, argsVinculo\)/);
  assert.match(crear, /resolverVentaInterna\(tx, argsVinculo\)/);
  const helper = leer("lib", "ventas-internas", "integracionVenta.js");
  assert.match(helper, /where: \{ id: Number\(clienteId\), grupoId \}/);
  assert.match(crear, /politicaStockOrigen: SOLO_TRANSITO/);
  assert.match(crear, /ventaId: nuevaVenta\.id/);
  // La respuesta pública sigue sin datos de transferencia.
  const respuesta = crear.slice(crear.indexOf("return NextResponse.json({\n      ok: true"));
  assert.equal(/transferencia:/.test(respuesta), false);

  for (const f of [
    ["lib", "ventas-internas", "mapearVentaATransferencia.js"],
    ["lib", "ventas-internas", "integracionVenta.js"],
    ["lib", "transferencias", "crearTransferencia.js"],
  ]) {
    assert.equal(leer(...f).includes("aviso"), false, `${f.join("/")} no debe saber del aviso`);
  }
});

test("21. la cola offline no cambió de formato", () => {
  // El aviso no toca lo que se persiste ni cómo se reintenta.
  const codigo = PAGINA_POS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const iAviso = codigo.indexOf("<AvisoVentaInterna");
  assert.ok(iAviso > 0);
  // El componente es autocontenido: no se agregó lógica de cola alrededor.
  assert.equal(/AvisoVentaInterna[\s\S]{0,200}(queue|offline|enqueue)/i.test(codigo.slice(iAviso)), false);
  assert.equal(COMPONENTE.includes("queue"), false);
  assert.equal(COMPONENTE.includes("offline"), false);
});

test("22. los clientes externos siguen sin ningún cambio de comportamiento", () => {
  // El aviso es lo único condicionado al vínculo: no se agregó ningún gate nuevo.
  const a = obtenerAvisoVentaInterna({ id: 3, nombre: "Consumidor final" });
  assert.equal(a.visible, false);
  // El componente devuelve null y no renderiza contenedor alguno.
  assert.match(COMPONENTE, /if \(!aviso\.visible\) return null;/);
});
