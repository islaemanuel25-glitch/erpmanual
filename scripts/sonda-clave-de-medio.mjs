// SONDA: EL VIAJE DE LA CLAVE DE EDICIÓN POR LA URL, A TRAVÉS DEL RUTEO REAL.
//
//   node --import ./scripts/alias-loader.mjs scripts/sonda-clave-de-medio.mjs \
//     --base http://localhost:3111
//
// ── QUÉ AGUJERO TAPA, Y ES UNO QUE YA SE COBRÓ UN DEFECTO EN PRODUCCIÓN ────
//
// `scripts/pruebas-db/mediosCobro.mjs` prueba los mismos handlers y tiene 96
// afirmaciones en verde, pero los llama DIRECTO: construye el `Request` a mano y
// le pasa `params` ya resuelto, con la clave lógica adentro. O sea que prueba el
// handler y NO prueba el transporte.
//
// El defecto que llegó a producción vivía exactamente ahí, en el pedazo que esa
// prueba no toca: la lista arma el enlace con `encodeURIComponent`, así que el
// segmento viaja como `defecto%3AEFECTIVO`, y lo que el ruteo entrega del otro
// lado no es lo mismo que la prueba le pasaba a mano. Los cuatro medios por
// defecto quedaron inabribles.
//
// Por eso esta sonda NO llama a los handlers: hace pedidos HTTP contra una
// aplicación levantada de verdad y mira qué contesta. Es la única forma de ver
// el tramo entre la URL y `params`.
//
// ── DÓNDE CORRE Y DÓNDE NO ────────────────────────────────────────────────
//
// Solo contra una base descartable: pide el cliente en nivel ESCRITURA, que
// exige host local y `NODE_ENV` distinto de production. En la práctica, el
// runner efímero de GitHub Actions. **Escribe**: materializa y borra medios del
// local que usa, y lo deja limpio entre casos a propósito, porque una clave de
// default solo resuelve mientras el local no tenga configuración propia.
//
// NO corre contra producción y no tiene forma de hacerlo.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO. Que la aplicación no conteste, que no haya un
// local usable o que falte `AUTH_SECRET` salen con 1 diciendo cuál: un
// despliegue no arranca con una verificación en estado desconocido.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3111").replace(/\/$/, "");
const SECRETO = process.env.AUTH_SECRET;

let pasadas = 0;
const fallas = [];
const ok = (t, c, d = "") => {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
};
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);

function frenar(motivo) {
  console.error(`\nNO SE PUDO MEDIR: ${motivo}`);
  process.exit(1);
}

if (!SECRETO) frenar("falta AUTH_SECRET en el entorno");

// ── El escenario ───────────────────────────────────────────────────────────

// El grupo NO es una columna de `Local`: cuelga de `GrupoLocal`, igual que lo
// resuelve `getGrupoIdDeLocal`. Se elige un local que esté en un grupo, porque
// sin grupo el alcance no se puede resolver y la ruta contesta 400.
const vinculo = await prisma.grupoLocal.findFirst({
  select: { grupoId: true, localId: true },
  orderBy: { localId: "asc" },
});
if (!vinculo) frenar("no hay ningún local dentro de un grupo en la base");

const local = { id: vinculo.localId, grupoId: vinculo.grupoId };

const usuario = await prisma.usuario.findFirst({ select: { id: true } });
if (!usuario) frenar("no hay ningún usuario en la base");

const sesion = jwt.sign(
  { id: usuario.id, nombre: "sonda", email: "sonda@ci", localId: local.id, grupoId: local.grupoId, permisos: ["*"] },
  SECRETO,
  { expiresIn: "1h" }
);

/** Deja al local SIN configuración propia: es la condición para que exista un default. */
async function volverALosDefaults() {
  await prisma.medioCobroLocal.deleteMany({ where: { localId: local.id } });
}

async function pedir(ruta, { metodo = "GET", cuerpo } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* la respuesta no era JSON */ }
  return { status: r.status, json, texto: texto.slice(0, 200) };
}

// ── 1. QUÉ CLAVE PUBLICA EL GET ────────────────────────────────────────────

seccion("lo que el GET publica, y con qué se arma el enlace");

await volverALosDefaults();

const listado = await pedir(`/api/medios-cobro?localId=${local.id}`);
if (listado.status !== 200) frenar(`el GET de medios contestó ${listado.status}: ${listado.texto}`);

const medios = listado.json?.medios || [];
ok("el local sin configurar devuelve los cuatro medios por defecto", medios.length === 4, `devolvió ${medios.length}`);

const efectivo = medios.find((m) => m.tipoContable === "EFECTIVO");
if (!efectivo) frenar("el GET no devolvió el medio EFECTIVO");

const CLAVE = efectivo.claveEdicion;
const SEGMENTO = encodeURIComponent(CLAVE);

console.log(`    claveEdicion del GET .......... ${JSON.stringify(CLAVE)}`);
console.log(`    segmento que arma la pantalla . ${JSON.stringify(SEGMENTO)}`);
console.log(`    usandoDefaults ................ ${listado.json?.usandoDefaults}`);

ok("la clave del default no es un id, es una clave de tipo", CLAVE === "defecto:EFECTIVO", CLAVE);
ok("y al codificarla para la URL deja de ser igual a sí misma", SEGMENTO !== CLAVE, SEGMENTO);

// ── 1.bis QUÉ LE LLEGA A LA PANTALLA ───────────────────────────────────────
//
// La pantalla de edición es un componente de cliente y lee el segmento con
// `use(params)`. El valor viaja serializado dentro de la respuesta de la ruta,
// así que se puede leer de ahí sin abrir un navegador: es la medición directa
// de qué recibe `params.clave`, y no una deducción a partir de lo que se ve.

seccion("qué valor de segmento le llega a la pantalla de edición");

const pagina = await fetch(`${BASE}/modulos/configuracion/pos-ventas/cobros/${SEGMENTO}`, {
  headers: { cookie: `erpazul_sesion=${sesion}` },
});
const cuerpoPagina = await pagina.text();

const llegaCodificado = cuerpoPagina.includes(SEGMENTO);
const llegaDecodificado = cuerpoPagina.includes(CLAVE);
console.log(`    la respuesta contiene ${JSON.stringify(SEGMENTO)} .... ${llegaCodificado}`);
console.log(`    la respuesta contiene ${JSON.stringify(CLAVE)} ...... ${llegaDecodificado}`);

ok("la pantalla contesta 200", pagina.status === 200, `contestó ${pagina.status}`);
ok(
  "el segmento le llega a la pantalla TAL CUAL viaja en la URL, sin decodificar",
  llegaCodificado,
  "no se encontró el segmento codificado en la respuesta"
);

// ── 2. PATCH CON LA CLAVE CODIFICADA ───────────────────────────────────────
//
// Éste es el caso real: es lo que manda el formulario, porque arma la URL con
// `encodeURIComponent`.

seccion("PATCH con la clave codificada — el caso que falló en producción");

await volverALosDefaults();

const patch = await pedir(`/api/medios-cobro/${SEGMENTO}`, { metodo: "PATCH", cuerpo: { nombre: "Efectivo" } });
console.log(`    PATCH /api/medios-cobro/${SEGMENTO} → ${patch.status} ${patch.json?.error || ""}`);

ok("el PATCH con la clave codificada resuelve el medio", patch.status === 200, `contestó ${patch.status}: ${patch.json?.error || patch.texto}`);

const despues = await prisma.medioCobroLocal.findMany({
  where: { localId: local.id },
  select: { id: true, tipoContable: true, activo: true },
  orderBy: { id: "asc" },
});
ok("y esa primera edición materializa LOS CUATRO, no solo el editado", despues.length === 4, `quedaron ${despues.length}`);
ok(
  "los cuatro son los tipos esperados",
  JSON.stringify(despues.map((m) => m.tipoContable).sort()) ===
    JSON.stringify(["CREDITO", "DEBITO", "EFECTIVO", "MERCADOPAGO"]),
  JSON.stringify(despues.map((m) => m.tipoContable))
);

// ── 3. UNA CLAVE MATERIALIZADA SIGUE ANDANDO ───────────────────────────────

seccion("una clave numérica materializada sigue andando");

const materializado = despues.find((m) => m.tipoContable === "EFECTIVO");
const porId = await pedir(`/api/medios-cobro/${encodeURIComponent(String(materializado.id))}`, {
  metodo: "PATCH",
  cuerpo: { nombre: "Efectivo" },
});
ok("PATCH por id sigue contestando 200", porId.status === 200, `contestó ${porId.status}: ${porId.json?.error || ""}`);

// ── 4. DELETE CON LA CLAVE CODIFICADA ──────────────────────────────────────

seccion("DELETE con la clave codificada");

await volverALosDefaults();

const borrado = await pedir(`/api/medios-cobro/${encodeURIComponent("defecto:CREDITO")}`, { metodo: "DELETE" });
console.log(`    DELETE /api/medios-cobro/${encodeURIComponent("defecto:CREDITO")} → ${borrado.status} ${borrado.json?.error || ""}`);

ok("el DELETE con la clave codificada resuelve el medio", borrado.status === 200, `contestó ${borrado.status}: ${borrado.json?.error || borrado.texto}`);

const quedan = await prisma.medioCobroLocal.findMany({ where: { localId: local.id }, select: { tipoContable: true } });
ok("materializó los cuatro y borró uno: quedan tres", quedan.length === 3, `quedaron ${quedan.length}`);
ok("el que se fue es el CRÉDITO", !quedan.some((m) => m.tipoContable === "CREDITO"), JSON.stringify(quedan.map((m) => m.tipoContable)));

// ── 5. UNA CLAVE INVÁLIDA SIGUE SIN RESOLVER NADA ──────────────────────────

seccion("lo que no direcciona nada sigue sin direccionar nada");

await volverALosDefaults();

const inventada = await pedir(`/api/medios-cobro/${encodeURIComponent("defecto:CRIPTO")}`, { metodo: "PATCH", cuerpo: { nombre: "X" } });
ok("un tipo que no se puede cobrar contesta 404", inventada.status === 404, `contestó ${inventada.status}`);

const doble = await pedir("/api/medios-cobro/defecto%253AEFECTIVO", { metodo: "PATCH", cuerpo: { nombre: "X" } });
ok(
  "NO hay doble decodificación: `%253A` no se convierte en `:`",
  doble.status === 404,
  `contestó ${doble.status} — si dio 200, algo decodificó dos veces`
);

const sinNada = await prisma.medioCobroLocal.count({ where: { localId: local.id } });
ok("y ninguna de las dos dejó filas escritas", sinNada === 0, `quedaron ${sinNada}`);

// ── Cierre ─────────────────────────────────────────────────────────────────

await volverALosDefaults();
await prisma.$disconnect();

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  console.log("\nEN ROJO:");
  for (const f of fallas) console.log(`  · ${f}`);
  process.exit(1);
}
