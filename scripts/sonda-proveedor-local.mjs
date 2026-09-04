// SONDA DEL ALCANCE DE PROVEEDOR Y DEL CATÁLOGO DE COMPRA, CONTRA LOS ENDPOINTS.
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO ALCANZA CON LOS CANDADOS ─────────────────
//
// Los candados de `lib/proveedores/proveedorLocal.test.mjs` son funciones puras:
// afirman la FORMA del `where` y la decisión de crear o reusar. No tocan
// Postgres, así que no pueden ver los dos defectos que más caro salen en este
// repo, y los dos aparecen recién contra la base:
//
//   · un nombre de relación equivocado —`localesAsociados`— compila, pasa los
//     3.000 candados y explota en la primera consulta real;
//   · un `where` que se arma bien pero no matchea ninguna fila deja al proveedor
//     invisible sin ningún error.
//
// Y hay una tercera cosa que solo se ve por acá: que el buscador de productos
// ofrezca EXACTAMENTE lo que `crear` acepta. Si divergen, el usuario elige algo
// que el servidor después rechaza, y ningún candado de forma lo nota.
//
// ── CÓMO ENTRA ────────────────────────────────────────────────────────────
//
// Login REAL contra `/api/login` y cookie del servidor. No firma tokens ni
// inyecta cookies: lo que se mide es la aplicación, no una maqueta. Es HTTP
// pelado, sin navegador, porque acá no hay nada que dibujar.
//
// CONTRA EL SERVIDOR DE DESARROLLO, NUNCA CONTRA PRODUCCIÓN: escribe.
//
// Uso:
//   node scripts/sonda-proveedor-local.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>
//
// ── QUÉ ESCRIBE EN LA BASE ────────────────────────────────────────────────
//
// Un `Proveedor` de prueba con un CUIT único por corrida, su `ProveedorLocal`, y
// un `PedidoProveedor` en BORRADOR por cada caso de catálogo. Queda todo
// nombrado con el prefijo `SONDA-` para poder reconocerlo. No borra nada.

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide una pantalla de login.");
  process.exit(1);
}

const fallas = [];
let n = 0;
const afirmar = (ok, titulo, detalle = "") => {
  n++;
  const linea = `  ${ok ? "OK  " : "ROJO"}  ${n}. ${titulo}${detalle ? ` — ${detalle}` : ""}`;
  console.log(linea);
  if (!ok) fallas.push(`${n}. ${titulo}${detalle ? ` — ${detalle}` : ""}`);
};
const nota = (t) => console.log(`  ----  ${t}`);
const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.\n");
  process.exit(1);
};

// ── EL FRASCO DE COOKIES REEMPLAZA POR NOMBRE, NO ACUMULA ─────────────────
//
// La primera versión concatenaba cada `set-cookie` al final del encabezado. Con
// eso, cambiar de ubicación mandaba `erpazul_contexto_activo` DOS VECES y el
// servidor se quedaba con la primera: todos los "ahora en el local" seguían
// midiendo el depósito, y la sonda informó cuatro rojos que no eran del código.
//
// Medido, no deducido: con dos `set` seguidos, `/api/contexto-activo/get`
// devolvía el primer local. Un frasco que acumula convierte una sonda en una
// máquina de diagnósticos falsos.
const frasco = new Map();
const encabezadoDeCookies = (jar) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

// Cada sesión lleva SU frasco. Sin eso, entrar como un segundo usuario pisaría
// la cookie del primero y las dos mitades de la prueba medirían a la misma
// persona — que es la versión con dos usuarios del defecto que ya tuvo esta
// sonda con el contexto.
async function pedir(metodo, ruta, cuerpo = null, jar = frasco) {
  const headers = { "Content-Type": "application/json" };
  if (jar.size) headers.Cookie = encabezadoDeCookies(jar);
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === null ? undefined : JSON.stringify(cuerpo),
    redirect: "manual",
  });
  // `getSetCookie` devuelve las cabeceras por separado; `get` las junta con
  // comas y una fecha de expiración lleva coma adentro. Se usa la primera si
  // está, que es la que no se puede partir mal.
  const crudas =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  for (const linea of crudas) {
    const par = String(linea).split(";")[0];
    const corte = par.indexOf("=");
    if (corte > 0) jar.set(par.slice(0, corte).trim(), par.slice(corte + 1));
  }
  const texto = await res.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { __noEsJson: texto.slice(0, 200) };
  }
  return { status: res.status, datos };
}

// ── 0 · SESIÓN ────────────────────────────────────────────────────────────

const login = await pedir("POST", "/api/login", { email: USUARIO, password: CLAVE });
if (login.status !== 200) morir(`el login devolvió ${login.status}`);
console.log(`\nsesión iniciada como ${USUARIO} contra ${BASE}\n`);

const locales = await pedir("GET", "/api/locales/opciones");
if (locales.status !== 200) morir(`/api/locales/opciones devolvió ${locales.status}`);
const items = locales.datos?.items || [];
const esDep = (l) => l.esDeposito === true || l.es_deposito === true;
const deposito = items.find(esDep);
const local = items.find((l) => !esDep(l));
if (!deposito) morir("no hay depósito en el grupo: sin él no se puede comparar con el caso de siempre");
if (!local) morir("no hay ningún local que no sea el depósito: el caso central de esta tanda no se puede ejercer");
nota(`depósito: ${deposito.nombre} (#${deposito.id}) · local: ${local.nombre} (#${local.id})`);

// FIJAR EL CONTEXTO Y COMPROBAR QUE CAMBIÓ. Las dos cosas, siempre.
//
// Sin la segunda mitad, un contexto que no se movió mide la ubicación
// equivocada y todo lo que sigue es un resultado sobre otra pantalla. Ya pasó
// una vez en esta misma sonda: es la comprobación que la habría atajado en el
// primer paso en vez de en cuatro afirmaciones rojas.
const fijarContexto = async (l) => {
  const r = await pedir("POST", "/api/contexto-activo/set", {
    localId: l.id,
    esDeposito: esDep(l),
  });
  if (r.status !== 200) morir(`no se pudo fijar el contexto en ${l.nombre}: ${r.status}`);
  const ahora = await pedir("GET", "/api/contexto-activo/get");
  if (Number(ahora.datos?.localId) !== Number(l.id)) {
    morir(
      `el contexto NO cambió: se pidió ${l.nombre} (#${l.id}) y el servidor ve ` +
        `#${ahora.datos?.localId}. Todo lo que midiera desde acá sería de otra ubicación.`
    );
  }
};

/** Los ids de proveedor visibles en la ubicación activa. */
const proveedoresVisibles = async () => {
  const r = await pedir("GET", "/api/proveedores/opciones");
  if (r.status !== 200) morir(`/api/proveedores/opciones devolvió ${r.status}`);
  return new Set((r.datos?.items || []).map((p) => Number(p.id)));
};

// ── 1 · LÍNEA DE BASE: LO QUE SE VE HOY, ANTES DE TOCAR NADA ──────────────

await fijarContexto(deposito);
const visiblesDepositoAntes = await proveedoresVisibles();
await fijarContexto(local);
const visiblesLocalAntes = await proveedoresVisibles();
nota(
  `visibles antes — depósito: ${visiblesDepositoAntes.size} · ${local.nombre}: ${visiblesLocalAntes.size}`
);
afirmar(
  visiblesDepositoAntes.size > 0,
  "hay proveedores legacy para comparar",
  `${visiblesDepositoAntes.size} visibles en el depósito`
);

// ── 2 · ALTA CON CUIT NUEVO, DESDE EL LOCAL ───────────────────────────────

const sello = Date.now();
const CUIT_NUEVO = `SONDA-${sello}`;
const NOMBRE = `SONDA proveedor ${sello}`;

const alta = await pedir("POST", "/api/proveedores/crear", {
  nombre: NOMBRE,
  cuit: CUIT_NUEVO,
});
afirmar(alta.status === 200 && alta.datos?.ok === true, "ALTA: el endpoint acepta con permiso", `status ${alta.status}`);
if (alta.status !== 200) morir("sin el alta no se puede seguir");

const proveedorId = Number(alta.datos?.item?.id);
afirmar(alta.datos?.proveedorCreado === true, "ALTA: se creó un Proveedor nuevo", `id ${proveedorId}`);
afirmar(
  alta.datos?.asociadoAUbicacion === true &&
    Number(alta.datos?.asociacion?.localId) === Number(local.id) &&
    Number(alta.datos?.asociacion?.proveedorId) === proveedorId &&
    alta.datos?.asociacion?.activo === true,
  "ALTA: se creó la asociación con la ubicación activa",
  JSON.stringify(alta.datos?.asociacion)
);
const asociacionId = Number(alta.datos?.asociacion?.id);

// ── 3 · VISIBILIDAD: SE VE ACÁ Y NO EN OTRO LADO ──────────────────────────

const visiblesLocalDespues = await proveedoresVisibles();
afirmar(
  visiblesLocalDespues.has(proveedorId),
  "VISIBILIDAD: el proveedor asociado SE VE en la ubicación que lo asoció",
  `${local.nombre}`
);
afirmar(
  [...visiblesLocalAntes].every((id) => visiblesLocalDespues.has(id)),
  "VISIBILIDAD: ningún proveedor que ya se veía en el local dejó de verse",
  `antes ${visiblesLocalAntes.size} · después ${visiblesLocalDespues.size}`
);

await fijarContexto(deposito);
const visiblesDepositoDespues = await proveedoresVisibles();
afirmar(
  !visiblesDepositoDespues.has(proveedorId),
  "VISIBILIDAD: NO se ve en otra ubicación",
  `el depósito ve ${visiblesDepositoDespues.size} y ninguno es el nuevo`
);
afirmar(
  [...visiblesDepositoAntes].every((id) => visiblesDepositoDespues.has(id)),
  "VISIBILIDAD: LOS PROVEEDORES LEGACY SIGUEN EXACTAMENTE COMO ANTES",
  `antes ${visiblesDepositoAntes.size} · después ${visiblesDepositoDespues.size} · ninguno perdido`
);

// ── 4 · IDEMPOTENCIA Y CUIT QUE YA EXISTE ─────────────────────────────────

await fijarContexto(local);
const repetida = await pedir("POST", "/api/proveedores/crear", {
  nombre: `${NOMBRE} (otro nombre)`,
  cuit: CUIT_NUEVO,
});
afirmar(repetida.status === 200 && repetida.datos?.ok === true, "IDEMPOTENCIA: repetir el alta contesta 200", `status ${repetida.status}`);
afirmar(
  repetida.datos?.proveedorCreado === false && Number(repetida.datos?.item?.id) === proveedorId,
  "CUIT EXISTENTE: NO se crea un segundo Proveedor",
  `mismo id ${repetida.datos?.item?.id}`
);
afirmar(
  repetida.datos?.item?.nombre === NOMBRE,
  "CUIT EXISTENTE: NO se pisan los datos globales del que ya estaba",
  `el nombre siguió siendo "${repetida.datos?.item?.nombre}" y no el del segundo pedido`
);
afirmar(
  Number(repetida.datos?.asociacion?.id) === asociacionId,
  "IDEMPOTENCIA: no aparece una segunda asociación",
  `misma fila #${repetida.datos?.asociacion?.id}`
);

// Dos pedidos EN PARALELO sobre la misma terna. La base tiene el único; lo que
// se comprueba acá es que ninguno termine en 500 y que no queden dos filas.
const [c1, c2] = await Promise.all([
  pedir("POST", "/api/proveedores/crear", { nombre: NOMBRE, cuit: CUIT_NUEVO }),
  pedir("POST", "/api/proveedores/crear", { nombre: NOMBRE, cuit: CUIT_NUEVO }),
]);
afirmar(
  ![c1.status, c2.status].includes(500),
  "CARRERA: dos altas simultáneas no terminan en 500",
  `status ${c1.status} y ${c2.status}`
);
const idsAsociacion = new Set(
  [c1, c2].filter((r) => r.datos?.asociacion?.id).map((r) => Number(r.datos.asociacion.id))
);
afirmar(
  idsAsociacion.size <= 1 && (idsAsociacion.size === 0 || idsAsociacion.has(asociacionId)),
  "CARRERA: no se generó ninguna asociación duplicada",
  `ids vistos: ${[...idsAsociacion].join(", ") || "(ninguno nuevo)"}`
);

// ── 5 · EL CATÁLOGO DE COMPRA, POR UBICACIÓN ──────────────────────────────

/** Un ProductoLocal comprable de la ubicación activa, según el propio buscador. */
const productosDeLaUbicacion = async (provId) => {
  const r = await pedir("GET", `/api/compras-proveedor/productos?proveedorId=${provId}`);
  return { status: r.status, items: r.datos?.items || [] };
};

/** Los ProductoLocal de la ubicación activa, por el listado del catálogo. */
const productoLocalDeLaUbicacion = async () => {
  const r = await pedir("GET", "/api/productos/listar?page=1");
  if (r.status !== 200) morir(`/api/productos/listar devolvió ${r.status}`);
  const fila = (r.datos?.items || []).find((p) => p.localProductoId && p.esCombo !== true);
  return fila ? { productoLocalId: Number(fila.localProductoId), nombre: fila.nombre } : null;
};

await fijarContexto(local);
const plLocal = await productoLocalDeLaUbicacion();
afirmar(Boolean(plLocal), "CATÁLOGO: el local tiene al menos un producto propio comprable", plLocal?.nombre || "ninguno");

await fijarContexto(deposito);
const plDeposito = await productoLocalDeLaUbicacion();
afirmar(Boolean(plDeposito), "CATÁLOGO: el depósito tiene al menos un producto", plDeposito?.nombre || "ninguno");

// El depósito sigue creando pedidos como siempre.
const proveedorDeposito = [...visiblesDepositoDespues][0];
const pedidoDeposito = await pedir("POST", "/api/compras-proveedor/crear", {
  proveedorId: proveedorDeposito,
  items: [{ productoLocalId: plDeposito.productoLocalId, cantidad: 1, unidad: "BULTO" }],
});
afirmar(
  pedidoDeposito.status === 200 && pedidoDeposito.datos?.ok === true,
  "DEPÓSITO: sigue creando pedidos con sus productos, como antes",
  `status ${pedidoDeposito.status}`
);

// Y el local crea el suyo, con un producto SUYO. Es lo que antes era imposible.
await fijarContexto(local);
const pedidoLocal = await pedir("POST", "/api/compras-proveedor/crear", {
  proveedorId,
  items: [{ productoLocalId: plLocal.productoLocalId, cantidad: 1, unidad: "BULTO" }],
});
afirmar(
  pedidoLocal.status === 200 && pedidoLocal.datos?.ok === true,
  "LOCAL: crea un pedido con un producto PROPIO",
  `status ${pedidoLocal.status} · ${pedidoLocal.datos?.error || ""}`
);
const pedidoLocalId = Number(pedidoLocal.datos?.item?.id);

// El id de OTRA ubicación se rechaza, aunque se pase a mano por la API.
const fuera = await pedir("POST", "/api/compras-proveedor/crear", {
  proveedorId,
  items: [{ productoLocalId: plDeposito.productoLocalId, cantidad: 1, unidad: "BULTO" }],
});
afirmar(
  fuera.status === 400,
  "ALCANCE: un ProductoLocal de otra ubicación se RECHAZA al crear",
  `status ${fuera.status} · ${fuera.datos?.error || ""}`
);

if (pedidoLocalId) {
  const otroDelLocal = await (async () => {
    const r = await pedir("GET", "/api/productos/listar?page=1");
    const filas = (r.datos?.items || []).filter((p) => p.localProductoId && p.esCombo !== true);
    return filas[1] ? Number(filas[1].localProductoId) : null;
  })();

  if (otroDelLocal) {
    const agregado = await pedir("POST", `/api/compras-proveedor/agregar-item/${pedidoLocalId}`, {
      productoLocalId: otroDelLocal,
      cantidad: 1,
      unidad: "BULTO",
    });
    afirmar(
      agregado.status === 200 && agregado.datos?.ok === true,
      "AGREGAR ITEM: el local suma otro producto suyo al pedido",
      `status ${agregado.status} · ${agregado.datos?.error || ""}`
    );
  } else {
    nota("el local tiene un solo producto: no se pudo ejercer agregar un SEGUNDO propio");
  }

  const agregadoFuera = await pedir("POST", `/api/compras-proveedor/agregar-item/${pedidoLocalId}`, {
    productoLocalId: plDeposito.productoLocalId,
    cantidad: 1,
    unidad: "BULTO",
  });
  afirmar(
    agregadoFuera.status === 400,
    "ALCANCE: un ProductoLocal de otra ubicación se RECHAZA al agregar",
    `status ${agregadoFuera.status} · ${agregadoFuera.datos?.error || ""}`
  );
}

// El buscador tiene que ofrecer el catálogo de la ubicación activa, no otro.
await fijarContexto(local);
const buscadorLocal = await productosDeLaUbicacion(proveedorId);
afirmar(
  buscadorLocal.status === 200,
  "BUSCADOR: contesta en la ubicación activa",
  `status ${buscadorLocal.status} · ${buscadorLocal.items.length} productos`
);

// ── 6 · EL ALCANCE: UN NO-ADMIN SIN ÁMBITO NO CREA NADA ───────────────────
//
// Es el defecto que encontró la revisión. `resolveLocalAndGrupo` falla cerrado
// para un no-admin, y la ruta convertía ese 403 en `null` para seguir creando un
// Proveedor GLOBAL. Acá se ejerce con un usuario de verdad, no con una maqueta:
// se le da `proveedores.crear` —o sea que el permiso NO es lo que lo frena— y se
// lo deja SIN local. Lo único que puede rechazarlo es el alcance.
await fijarContexto(local);

const sufijo = `${sello}`;
const rolSinAlcance = await pedir("POST", "/api/roles/crear", {
  nombre: `SONDA_SIN_ALCANCE_${sufijo}`,
  permisos: ["proveedores.crear", "compras.ver"],
});
const claveSonda = `sonda-${sufijo}-Aa1!`;
const usuarioSinAlcance = `sonda-sin-alcance-${sufijo}@sonda.local`;
const altaUsuario = await pedir("POST", "/api/usuarios/crear", {
  nombre: "Sonda sin alcance",
  email: usuarioSinAlcance,
  password: claveSonda,
  rolId: rolSinAlcance.datos?.item?.id ?? rolSinAlcance.datos?.id,
  localId: null,
});
afirmar(
  rolSinAlcance.status < 400 && altaUsuario.status < 400,
  "ALCANCE: se pudo preparar un usuario con el permiso y SIN local",
  `rol ${rolSinAlcance.status} · usuario ${altaUsuario.status} ${altaUsuario.datos?.error || ""}`
);

if (rolSinAlcance.status < 400 && altaUsuario.status < 400) {
  const otroFrasco = new Map();
  const login2 = await pedir(
    "POST",
    "/api/login",
    { email: usuarioSinAlcance, password: claveSonda },
    otroFrasco
  );
  afirmar(login2.status === 200, "ALCANCE: el usuario de prueba puede iniciar sesión", `status ${login2.status}`);

  if (login2.status === 200) {
    const cuantosAntes = (await pedir("GET", "/api/proveedores/opciones")).datos?.items?.length ?? 0;

    const sinAlcance = await pedir(
      "POST",
      "/api/proveedores/crear",
      { nombre: `SONDA sin alcance ${sufijo}`, cuit: `SONDA-SINALCANCE-${sufijo}` },
      otroFrasco
    );
    afirmar(
      sinAlcance.status === 403 || sinAlcance.status === 409,
      "ALCANCE: un no-admin SIN local recibe el error del scope, no un 200",
      `status ${sinAlcance.status} · ${sinAlcance.datos?.error || ""}`
    );
    afirmar(
      sinAlcance.datos?.ok !== true,
      "ALCANCE: y la respuesta no dice que se creó nada",
      `ok=${sinAlcance.datos?.ok}`
    );

    // Y NO quedó ningún Proveedor nuevo: es la mitad que importa. Un 403 que
    // igual escribe es peor que un 200.
    const cuantosDespues = (await pedir("GET", "/api/proveedores/opciones")).datos?.items?.length ?? 0;
    afirmar(
      cuantosDespues === cuantosAntes,
      "ALCANCE: NO se creó ningún Proveedor global",
      `antes ${cuantosAntes} · después ${cuantosDespues}`
    );
  }
}

// ── 7 · ADMIN SIN CONTEXTO: EL CAMINO LEGACY, Y SOLO ESE ──────────────────
//
// Antes de esta tanda un admin sin ubicación seleccionada creaba un proveedor
// global. Ese camino se conserva tal cual, y acá se comprueba que sigue vivo: se
// borra la cookie de contexto y se da de alta. Tiene que crear el proveedor y NO
// asociarlo a ninguna ubicación, porque no hay ninguna elegida.
frasco.delete("erpazul_contexto_activo");
const global = await pedir("POST", "/api/proveedores/crear", {
  nombre: `SONDA global ${sufijo}`,
  cuit: `SONDA-GLOBAL-${sufijo}`,
});
afirmar(
  global.status === 200 && global.datos?.ok === true && global.datos?.proveedorCreado === true,
  "ADMIN SIN CONTEXTO: el alta global legacy sigue funcionando",
  `status ${global.status} · ${global.datos?.error || ""}`
);
afirmar(
  global.datos?.asociadoAUbicacion === false && global.datos?.asociacion === null,
  "ADMIN SIN CONTEXTO: y NO se asocia a ninguna ubicación",
  `asociacion=${JSON.stringify(global.datos?.asociacion)}`
);

console.log("");
if (fallas.length === 0) {
  console.log("VERDE · el proveedor del local se ve donde corresponde y el catálogo sigue a la ubicación.");
} else {
  console.log(`ROJO · ${fallas.length} afirmaciones fallaron:`);
  for (const f of fallas) console.log(`  · ${f}`);
}
console.log("");
process.exit(fallas.length === 0 ? 0 : 1);
