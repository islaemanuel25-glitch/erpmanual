// SONDA: cuándo se mueve `precioRevisadoAt`, ejercido contra el servidor real.
//
// ── POR QUÉ NO ALCANZAN LOS CANDADOS ───────────────────────────────────────
//
// `revisionDePrecio.test.mjs` prueba la REGLA —qué cuenta como cambio de precio
// efectivo— y la prueba bien. Lo que no puede probar es el CABLEADO: que las tres
// rutas que escriben precios usen esa regla, en el lugar correcto, con el "antes"
// leído a tiempo.
//
// Es el espacio entre las piezas, que es donde este repo ya se comió cinco
// defectos con los candados en verde. La regla puede estar perfecta y la ruta
// puede leer el precio anterior DESPUÉS de haberlo pisado, y todo compila.
//
// ── LAS CINCO CONTRAPRUEBAS QUE PIDIÓ LA REVISIÓN ─────────────────────────
//
//   1. editar solo nombre/proveedor NO mueve la revisión;
//   2. cambiar el precio por la ruta base SÍ, y solo donde cambió;
//   3. cambiar el precio desde un override SÍ, y solo en ese local;
//   4. una actualización masiva con la misma venta NO mueve nada;
//   5. la acción explícita mueve aunque el precio no cambie.
//
// ── ESCRIBE, ASÍ QUE NO VA CONTRA PRODUCCIÓN ──────────────────────────────
//
// Toca productos reales de la base a la que apunte. Cada caso guarda el valor
// anterior y lo repone al terminar, y al final comprueba que lo repuso. Aun así:
// `--base` apunta a desarrollo y no hay forma de que apunte a otro lado sin
// escribirlo a mano.
//
// Uso:
//   node scripts/sonda-revision-de-precio.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>

// ── LA FÁBRICA VA PRIMERO, ANTES QUE NADA ─────────────────────────────────
//
// Es la regla del proyecto y acá se cumple sola porque este archivo no importa
// otra cosa. `@prisma/client` carga el `.env` al importarse, y la fábrica
// distingue "la URL la puso el operador" de "la puso el archivo" capturándola
// antes de que eso ocurra.
//
// Nivel LECTURA: la sonda ESCRIBE, pero escribe por las rutas HTTP, que es lo que
// se está probando. Prisma se usa solo para MIRAR `precioRevisadoAt`, que es la
// única forma de contestar la pregunta de la revisión —la API no expone esa
// columna, y afirmar sobre ella mirando otra cosa sería adivinar.
import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

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
  console.error("Faltan --usuario y --clave.");
  process.exit(1);
}
if (/operix\.cloud/i.test(BASE)) {
  console.error("Esta sonda ESCRIBE. No corre contra producción.");
  process.exit(2);
}

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    console.log(`        ${detalle}`);
  }
};
const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

// ── SESIÓN ────────────────────────────────────────────────────────────────
//
// Las cookies se ACUMULAN por nombre, no se reemplazan. La primera versión hacía
// `cookie = set.map(...).join("; ")` en cada respuesta: el login deja cuatro
// cookies y la llamada siguiente devuelve una sola, así que esa línea borraba las
// otras tres —incluida la de sesión— y todo lo posterior contestaba como si no
// hubiera nadie logueado. El síntoma era "la sesión no ve ninguna ubicación", que
// apunta a los permisos y no a esto.
const cookies = new Map();
const cabeceraCookie = () =>
  [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function pedir(ruta, { metodo = "GET", cuerpo = null } = {}) {
  const actual = cabeceraCookie();
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(actual ? { cookie: actual } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  for (const c of r.headers.getSetCookie?.() || []) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  return { status: r.status, json, texto };
}

const login = await pedir("/api/login", {
  metodo: "POST",
  cuerpo: { email: USUARIO, password: CLAVE },
});
if (login.status !== 200) morir(`el login devolvió ${login.status}`);
console.log(`\n  login OK como ${USUARIO}`);

// ── EL CONTEXTO SE FIJA, NO SE HEREDA ─────────────────────────────────────
//
// Un admin recién logueado NO tiene ubicación activa: `/api/contexto-activo/get`
// contesta `needsContexto`. Hay que elegir grupo y local, igual que hace el
// selector de la interfaz.
//
// `scripts/lib/sesionArnes.mjs` hace estos mismos tres pasos, pero DENTRO del
// navegador —recibe un `evaluar`—, así que no se puede llamar desde acá, que
// habla por `fetch`. Es la misma secuencia escrita en dos sitios y eso es una
// deuda anotada; lo que la hace tolerable es que si el flujo cambia, esta sonda
// muere con un mensaje que lo dice, en vez de medir la pantalla equivocada.
async function fijarContexto() {
  const grupos = await pedir("/api/grupos/listar");
  const g = (grupos.json?.items || grupos.json?.grupos || [])[0];
  if (g) await pedir("/api/grupo-activo/set", { metodo: "POST", cuerpo: { grupoId: g.id } });

  const locales = await pedir("/api/locales/opciones");
  const items = locales.json?.items || [];
  const esDep = (l) => l.esDeposito === true || l.es_deposito === true;
  const elegido = items.find(esDep) || items[0];
  if (!elegido) morir("la sesión no ve ninguna ubicación");

  const r = await pedir("/api/contexto-activo/set", {
    metodo: "POST",
    cuerpo: { localId: elegido.id, esDeposito: esDep(elegido) },
  });
  if (r.status !== 200) morir(`no se pudo fijar el contexto: ${r.status} ${r.texto.slice(0, 160)}`);
  return { localId: elegido.id, nombre: elegido.nombre, deposito: esDep(elegido) };
}

const ctx = await fijarContexto();
const localId = ctx.localId;
console.log(`  ubicación activa: ${ctx.nombre}${ctx.deposito ? " (depósito)" : ""} #${localId}\n`);

// ── UN PRODUCTO DE VERDAD PARA EJERCER ───────────────────────────────────
//
// Se busca uno NORMAL y con precio: un combo o un servicio no ejercen esta regla.
const listado = await pedir(
  `/api/productos/listar?page=1&pageSize=100&localId=${localId}&estado=activos&tipo=productos`
);
// Con código de barras principal: la ruta rechaza guardar un secundario sin
// principal, y hay productos así en la base. Que la sonda tropiece con esa
// validación no prueba nada sobre la revisión de precio.
const candidato = (listado.json?.items || []).find(
  (p) => Number(p.precioVenta) > 0 && !p.esCombo && p.codigoBarra
);
if (!candidato) morir("no hay ningún producto normal, con precio y con código de barras en esta base");
const id = candidato.id;
console.log(`  producto de prueba: #${id} ${candidato.nombre}\n`);

// ── LA FECHA SE MIRA EN LA COLUMNA, NO SE DEDUCE ──────────────────────────
//
// La primera versión preguntaba si el producto aparecía en el control de "precio
// vencido". Eso NO distingue lo que hay que distinguir: el producto arranca
// revisado, así que "no está vencido" da verdadero antes y después de cualquier
// edición, y las dos afirmaciones pasaban sin haber mirado nada. Un candado que
// contesta lo mismo con el defecto puesto y sin él no está afirmando.
//
// La pregunta real es si la fecha SE MOVIÓ, y la única forma de contestarla es
// leer `precioRevisadoAt`.
const prisma = await crearClientePrisma({ nivel: LECTURA });

const revisadoAtDe = async (productoId, enLocal) => {
  const fila = await prisma.productoLocal.findFirst({
    where: { baseId: productoId, localId: enLocal },
    select: { precioRevisadoAt: true },
  });
  return fila?.precioRevisadoAt ? fila.precioRevisadoAt.getTime() : null;
};

const fichaDe = async (productoId) => {
  const r = await pedir(`/api/productos/obtener?id=${productoId}&localId=${localId}`);
  if (!r.json?.ok) morir(`no se pudo leer el producto: ${r.json?.error || r.status}`);
  return r.json.item;
};

// ── LA FORMA QUE ESPERA LA RUTA ES snake_case ────────────────────────────
//
// `/api/productos/obtener` devuelve camelCase —`precioVenta`— y `splitUiToDb`
// lee snake_case —`precio_venta`—. En medio está `FormProducto`, que normaliza
// una cosa en la otra. Mandarle el item tal cual a la ruta hace que `precio_venta`
// llegue en null y el guardado devuelve 500 con "Error interno", sin decir cuál
// era el campo: hubo que ir al log del servidor a buscarlo.
//
// Esta conversión es del ARNÉS y solo cubre los campos que estas afirmaciones
// tocan. NO se extrajo la de `FormProducto` a una función compartida —que sería
// lo correcto— porque eso toca el formulario, y esta tanda es de correcciones de
// revisión: mover el normalizador del form pide su propia verificación de que la
// pantalla no se movió un píxel. Queda anotado.
const aPayload = (item, cambios) => ({
  nombre: cambios.nombre ?? item.nombre,
  descripcion: item.descripcion ?? "",
  sku: item.sku ?? "",
  codigo_barra: item.codigoBarra ?? "",
  codigo_barra_secundario: item.codigoBarraSecundario ?? "",
  categoria_id: item.categoriaId ?? null,
  proveedor_id: item.proveedorId ?? null,
  proveedor2_id: item.proveedor2Id ?? null,
  proveedor3_id: item.proveedor3Id ?? null,
  area_fisica_id: item.areaFisicaId ?? null,
  unidad_medida: item.unidadMedida ?? "unidad",
  factor_pack: item.factorPack ?? null,
  modo_pedido: item.modoPedido ?? undefined,
  peso_kg: item.pesoKg ?? null,
  volumen_ml: item.volumenMl ?? null,
  precio_costo: Number(item.precioCosto),
  precio_venta: Number(cambios.precioVenta ?? item.precioVenta),
  margen: item.margen ?? null,
  precio_sugerido: item.precioSugerido ?? null,
  iva_porcentaje: item.ivaPorcentaje ?? null,
  fecha_vencimiento: item.fechaVencimiento
    ? String(item.fechaVencimiento).split("T")[0]
    : "",
  redondeo_100: Boolean(item.redondeo100),
  activo: Boolean(item.activo),
  imagen_url: item.imagenUrl ?? "",
  es_combo: Boolean(item.esCombo),
  modalidad: item.modalidad === "IMPORTE_VARIABLE" ? "IMPORTE_VARIABLE" : "NORMAL",
  reglaPrecio: item.reglaPrecio ?? "MARGEN_PORCENTUAL",
  recargoFijoUnidad: item.recargoFijoUnidad ?? null,
  localId,
});

const guardar = async (item, cambios) => {
  const r = await pedir(`/api/productos/editar/${item.id}`, {
    metodo: "PUT",
    cuerpo: aPayload(item, cambios),
  });
  if (r.status !== 200 || !r.json?.ok) {
    morir(`el guardado devolvió ${r.status}: ${r.json?.error || r.texto.slice(0, 200)}`);
  }
  return r.json;
};

const marcarRevisado = async (productoId) => {
  const r = await pedir("/api/productos/precio-revisado", {
    metodo: "POST",
    cuerpo: { productoBaseIds: [productoId], localId },
  });
  if (!r.json?.ok) morir(`precio-revisado devolvió ${r.json?.error || r.status}`);
  return r.json;
};

const original = await fichaDe(id);
const precioOriginal = Number(original.precioVenta);
const nombreOriginal = original.nombre;

// Un local que NO es el depósito, para ejercer la ruta de override. Sin él ese
// caso no se ejerce, y no se disfraza de verde.
const otroLocal = (await pedir("/api/locales/opciones")).json?.items?.find(
  (l) => l.id !== localId && !(l.esDeposito ?? l.es_deposito)
);

try {
  // ── 1 · LA ACCIÓN EXPLÍCITA REVISA AUNQUE EL PRECIO NO CAMBIE ───────────
  //
  // Va primera porque deja la fecha en un valor conocido y reciente: todas las
  // demás afirman sobre si se movió respecto de ésta.
  const antesDeMarcar = await revisadoAtDe(id, localId);
  await marcarRevisado(id);
  const trasMarcar = await revisadoAtDe(id, localId);
  afirmar(
    trasMarcar !== null && trasMarcar !== antesDeMarcar,
    "1 · la acción `Precio revisado` mueve la fecha sin tocar el precio",
    `la fecha quedó en ${trasMarcar} y era ${antesDeMarcar}`
  );

  // ── 2 · EDITAR SOLO EL NOMBRE NO MUEVE LA REVISIÓN ─────────────────────
  //
  // LA CONTRAPRUEBA DEL DEFECTO QUE ENCONTRÓ LA REVISIÓN. Antes del arreglo,
  // este guardado escribía `precioRevisadoAt = now()` y declaraba revisado un
  // precio que nadie miró.
  //
  // Se mide la FECHA y no "si aparece en el control": el producto viene de
  // marcarse recién, así que "no está vencido" da verdadero antes y después, y
  // esa comparación pasaría en verde con el defecto puesto.
  await guardar(await fichaDe(id), { nombre: `${nombreOriginal} editado` });
  const ficha2 = await fichaDe(id);
  const trasNombre = await revisadoAtDe(id, localId);
  afirmar(
    Number(ficha2.precioVenta) === precioOriginal,
    "2a · editar el nombre no tocó el precio",
    `el precio quedó en ${ficha2.precioVenta}, era ${precioOriginal}`
  );
  afirmar(
    ficha2.nombre === `${nombreOriginal} editado`,
    "2b · el nombre SÍ se guardó, o sea que la edición ocurrió",
    `quedó "${ficha2.nombre}"`
  );
  afirmar(
    trasNombre === trasMarcar,
    "2c · y la fecha de revisión NO se movió",
    `la fecha pasó de ${trasMarcar} a ${trasNombre} con una edición que no toca precios`
  );

  // ── 3 · CAMBIAR EL PRECIO POR LA RUTA BASE SÍ REVISA ───────────────────
  const precioNuevo = Math.round((precioOriginal + 137) * 100) / 100;
  await guardar(await fichaDe(id), { precioVenta: precioNuevo });
  const ficha3 = await fichaDe(id);
  const trasPrecio = await revisadoAtDe(id, localId);
  afirmar(
    Number(ficha3.precioVenta) === precioNuevo,
    `3a · el precio se guardó (${precioOriginal} → ${precioNuevo})`,
    `quedó en ${ficha3.precioVenta}`
  );
  afirmar(
    trasPrecio !== null && trasPrecio !== trasNombre,
    "3b · y la fecha de revisión SÍ se movió",
    `la fecha quedó en ${trasPrecio} y era ${trasNombre}`
  );

  // ── 3-bis · Y SOLO DONDE EL PRECIO CAMBIÓ ─────────────────────────────
  //
  // La ruta base alinea el depósito y la ubicación que opera. Los demás locales
  // conservan su override y su fecha: nadie miró su precio.
  if (!otroLocal) {
    console.log("  ----  3c · no hay un segundo local en estos datos:");
    console.log("        que la revisión NO se propague no se ejerció. No es un pase.");
  } else {
    const otroAntes = await revisadoAtDe(id, otroLocal.id);
    await guardar(await fichaDe(id), { precioVenta: precioNuevo + 11 });
    const otroDespues = await revisadoAtDe(id, otroLocal.id);
    afirmar(
      otroDespues === otroAntes,
      `3c · la revisión NO se propagó a ${otroLocal.nombre}`,
      `su fecha pasó de ${otroAntes} a ${otroDespues}`
    );
  }

  // ── 4 · GUARDAR EL MISMO PRECIO NO ES UNA REVISIÓN NUEVA ───────────────
  const ficha4Antes = await fichaDe(id);
  const antesDeRepetir = await revisadoAtDe(id, localId);
  await guardar(ficha4Antes, { precioVenta: Number(ficha4Antes.precioVenta) });
  const trasRepetir = await revisadoAtDe(id, localId);
  afirmar(
    trasRepetir === antesDeRepetir,
    "4 · guardar el MISMO precio no mueve la fecha",
    `la fecha pasó de ${antesDeRepetir} a ${trasRepetir}`
  );

  // ── 5 · LA ACTUALIZACIÓN MASIVA CON LA MISMA VENTA ─────────────────────
  //
  // `KEEP_VENTA` con `ventaNueva === ventaAnterior`: la rama que escribe el
  // precio se ejecuta igual, y antes de este arreglo marcaba revisado.
  const ficha5Antes = await fichaDe(id);
  const antesDelApply = await revisadoAtDe(id, localId);
  const apply = await pedir("/api/productos/precios/apply", {
    metodo: "POST",
    cuerpo: {
      localId,
      proveedorId: ficha5Antes.proveedorId ?? null,
      metodo: "MARGEN_MASIVO",
      pricingMode: "KEEP_VENTA",
      items: [
        {
          productoBaseId: id,
          costoAnterior: Number(ficha5Antes.precioCosto),
          costoNuevo: Number(ficha5Antes.precioCosto),
          ventaAnterior: Number(ficha5Antes.precioVenta),
          ventaNueva: Number(ficha5Antes.precioVenta),
        },
      ],
    },
  });
  afirmar(
    apply.json?.ok === true,
    "5a · la actualización masiva con la misma venta se aplica sin error",
    `${apply.status}: ${apply.json?.error || apply.texto.slice(0, 160)}`
  );
  const trasApply = await revisadoAtDe(id, localId);
  afirmar(
    trasApply === antesDelApply,
    "5b · y NO mueve la fecha de revisión",
    `la fecha pasó de ${antesDelApply} a ${trasApply}`
  );

  // ── 5-bis · UNA MASIVA QUE SÍ CAMBIA EL PRECIO SÍ REVISA ──────────────
  //
  // La contraprueba de 5b: si la ruta hubiera dejado de marcar en TODOS los
  // casos, 5b pasaría igual y el arreglo habría roto la función.
  const ficha6Antes = await fichaDe(id);
  const ventaOtra = Number(ficha6Antes.precioVenta) + 23;
  const apply2 = await pedir("/api/productos/precios/apply", {
    metodo: "POST",
    cuerpo: {
      localId,
      proveedorId: ficha6Antes.proveedorId ?? null,
      metodo: "MARGEN_MASIVO",
      pricingMode: "SET_VENTA",
      items: [
        {
          productoBaseId: id,
          costoAnterior: Number(ficha6Antes.precioCosto),
          costoNuevo: Number(ficha6Antes.precioCosto),
          ventaAnterior: Number(ficha6Antes.precioVenta),
          ventaNueva: ventaOtra,
        },
      ],
    },
  });
  afirmar(
    apply2.json?.ok === true,
    "5c · una masiva que cambia el precio se aplica sin error",
    `${apply2.status}: ${apply2.json?.error || apply2.texto.slice(0, 160)}`
  );
  const trasApply2 = await revisadoAtDe(id, localId);
  afirmar(
    trasApply2 !== trasApply,
    "5d · y esa SÍ mueve la fecha",
    `la fecha quedó en ${trasApply2} y era ${trasApply}`
  );

  // ── 7 · DESDE UN LOCAL, EL OVERRIDE TAMBIÉN REVISA ────────────────────
  //
  // El otro lado del defecto: `editarOverride` escribía el precio de venta de un
  // local y NO marcaba nada, así que un precio recién decidido seguía apareciendo
  // en el control de los 30 días.
  if (!otroLocal) {
    console.log("  ----  7 · no hay un segundo local en estos datos:");
    console.log("        la ruta de override NO se ejerció. No es un pase.");
  } else {
    const r = await pedir("/api/contexto-activo/set", {
      metodo: "POST",
      cuerpo: { localId: otroLocal.id, esDeposito: false },
    });
    if (r.status !== 200) morir(`no se pudo cambiar de ubicación: ${r.status}`);

    const antesOverride = await revisadoAtDe(id, otroLocal.id);
    const enLocal = await pedir(`/api/productos/obtener?id=${id}&localId=${otroLocal.id}`);
    const itemLocal = enLocal.json?.item;
    if (!itemLocal) morir("el producto no se ve desde el otro local");

    const ventaLocalNueva = Number(itemLocal.precioVenta) + 57;
    const g = await pedir(`/api/productos/editar/${id}`, {
      metodo: "PUT",
      cuerpo: { ...aPayload(itemLocal, { precioVenta: ventaLocalNueva }), localId: otroLocal.id },
    });
    afirmar(
      g.status === 200 && g.json?.ok === true,
      "7a · un local puede guardar su propio precio de venta",
      `${g.status}: ${g.json?.error || g.texto.slice(0, 160)}`
    );
    const despuesOverride = await revisadoAtDe(id, otroLocal.id);
    afirmar(
      despuesOverride !== null && despuesOverride !== antesOverride,
      `7b · y eso mueve la revisión de ${otroLocal.nombre}`,
      `la fecha pasó de ${antesOverride} a ${despuesOverride}`
    );
    // Y SOLO la de ese local: el depósito no se toca.
    const depositoAhora = await revisadoAtDe(id, localId);
    afirmar(
      depositoAhora === trasApply2,
      "7c · y NO mueve la del depósito",
      `la del depósito pasó de ${trasApply2} a ${depositoAhora}`
    );

    // Se devuelve el override del local a donde estaba y se vuelve al depósito.
    await pedir(`/api/productos/editar/${id}`, {
      metodo: "PUT",
      cuerpo: {
        ...aPayload(itemLocal, { precioVenta: Number(itemLocal.precioVenta) }),
        localId: otroLocal.id,
      },
    });
    await pedir("/api/contexto-activo/set", {
      metodo: "POST",
      cuerpo: { localId, esDeposito: true },
    });
  }
} finally {
  // ── SE REPONE, Y SE COMPRUEBA QUE SE REPUSO ─────────────────────────────
  //
  // Un `finally` que restaura sin verificar deja la base sucia cuando el restore
  // falla, y eso no se ve hasta que otra medición da raro.
  await guardar(await fichaDe(id), {
    nombre: nombreOriginal,
    precioVenta: precioOriginal,
  });
  const final = await fichaDe(id);
  const repuesto =
    final.nombre === nombreOriginal && Number(final.precioVenta) === precioOriginal;
  console.log("");
  afirmar(
    repuesto,
    `6 · el producto de prueba quedó como estaba (#${id})`,
    `nombre "${final.nombre}" (era "${nombreOriginal}") · precio ${final.precioVenta} (era ${precioOriginal})`
  );
  // Y se lo deja revisado, que es el estado en el que estaba al empezar si nadie
  // lo tocó: la reposición cambió el precio, así que quedó revisado por regla.
  await prisma.$disconnect();
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} afirmación(es) sobre la revisión de precio no se cumplen.`);
  for (const f of fallas) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("VERDE · la revisión de precio se mueve donde tiene que moverse, y no donde no.");
process.exit(0);
