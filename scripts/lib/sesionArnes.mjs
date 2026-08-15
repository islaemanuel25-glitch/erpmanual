// LA SESIÓN DE LOS ARNESES DE CAPTURA, en un solo lugar.
//
// ── POR QUÉ ACÁ Y NO COPIADA EN CADA ARNÉS ────────────────────────────────────
//
// `generar-huellas.mjs` ya sabía loguearse y fijar contexto; `medir-desborde.mjs`
// no, y por eso las capturas de un modal salían de la pantalla de login —
// determinista, y por lo tanto capaz de pasar cualquier control de estabilidad.
//
// La salida fácil era copiar las tres funciones al segundo arnés. Dos copias de
// una regla no se rompen el día que se escriben: se rompen el día que una cambia.
// Si mañana el ERP agrega un paso al contexto —otro selector, otra ubicación— la
// copia que no se toque va a seguir sacando fotos de una pantalla equivocada sin
// decir nada.
//
// Recibe `navegar` y `evaluar` en vez de hablar CDP: los dos arneses ya tienen
// los suyos y no hacía falta un tercer cliente.

/**
 * ¿La cookie del perfil todavía sirve?
 *
 * Se pregunta antes de loguear porque **`/api/login` limita a 10 intentos cada
 * 15 minutos por IP**, y una corrida por tandas los consume enseguida. Cuando
 * empieza a fallar hay que esperar, no reintentar.
 */
export async function sesionVigente({ navegar, evaluar, base }) {
  await navegar(`${base}/login`);
  const r = await evaluar(
    `fetch("/api/contexto-activo/get", { credentials: "same-origin" })
       .then((r) => r.status + "").catch(() => "err")`,
    true
  );
  return r === "200";
}

/** Login REAL contra `/api/login`. No se firman tokens ni se inyectan cookies. */
export async function iniciarSesion({ navegar, evaluar, base, usuario, clave, log }) {
  await navegar(`${base}/login`);
  const res = await evaluar(
    `fetch("/api/login", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       credentials: "same-origin",
       body: JSON.stringify({ email: ${JSON.stringify(usuario)}, password: ${JSON.stringify(clave)} }),
     }).then(r => r.status + "")`,
    true
  );
  if (res !== "200") throw new Error(`Login real falló con status ${res}`);
  log?.(`  login real OK como ${usuario}`);
}

/**
 * Grupo activo y ubicación, como los fijaría el selector de la interfaz.
 *
 * Sin esto un admin sin local fijo entra SIN CONTEXTO y el ERP lo desvía a
 * `/inicio`: la pantalla que se quería medir no se llega a dibujar nunca y la
 * foto sale de otro lado.
 *
 * `ubicacion` elige un local POR NOMBRE en vez del depósito. Existe porque hay
 * pantallas que solo viven en un local —el POS— y su estado depende de ESE
 * local: el del depósito puede estar bloqueado por una caja vencida y el otro
 * no. Sin esto la única salida era escribir en la base para destrabarlo, que es
 * justo lo que no se hace.
 */
export async function fijarContexto({ evaluar, log, ubicacion = null }) {
  const contexto = await evaluar(
    `(async () => {
       const j = (r) => r.json();
       const grupos = await fetch("/api/grupos/listar", { credentials: "same-origin" }).then(j).catch(() => null);
       const g = (grupos?.items || grupos?.grupos || [])[0];
       if (g) {
         await fetch("/api/grupo-activo/set", {
           method: "POST", headers: { "Content-Type": "application/json" },
           credentials: "same-origin", body: JSON.stringify({ grupoId: g.id }),
         });
       }
       // ── POR QUÉ "opciones" Y NO "listar" ──────────────────────────────────
       //
       // OJO: esto es el CUERPO DE UN TEMPLATE LITERAL. Nada de backticks acá
       // adentro, ni siquiera en un comentario: cierran la cadena y el archivo
       // deja de parsear. Ya pasó al escribir este mismo bloque.
       //
       // "locales/listar" devuelve TODOS los locales con dirección, teléfono y
       // CUIL, así que desde el INC-0007 pide administrador. El arnés lo usaba
       // para elegir dónde pararse, y con eso dejó de poder entrar con cualquier
       // usuario que no fuera admin: contestaba "sin locales" y la corrida moría
       // antes de sacar una sola foto.
       //
       // "opciones" es la que corresponde para esto: devuelve id, nombre y
       // esDeposito —los tres campos que se usan acá y nada más— y RECORTA AL
       // LOCAL PROPIO cuando la sesión no es admin, que es justamente lo que el
       // arnés quiere para medir una pantalla como la ve esa persona.
       const locales = await fetch("/api/locales/opciones", { credentials: "same-origin" }).then(j).catch(() => null);
       const items = locales?.items || [];
       // Devuelve esDeposito (camelCase); se tolera la otra grafía por las dudas.
       const esDep = (l) => l.esDeposito === true || l.es_deposito === true;
       const pedido = ${JSON.stringify(ubicacion)};
       const porNombre = pedido
         ? items.find((l) => String(l.nombre).toLowerCase() === String(pedido).toLowerCase())
         : null;
       // Si se pidió una ubicación por nombre y no está, se FALLA nombrándola.
       // Caer al depósito en silencio mediría otra pantalla y la foto saldría
       // igual de convincente.
       if (pedido && !porNombre)
         return JSON.stringify({
           error: "no existe la ubicación " + pedido,
           disponibles: items.map((l) => l.nombre),
         });
       const elegido = porNombre || items.find(esDep) || items[0];
       if (!elegido) return JSON.stringify({ error: "sin locales" });
       const r = await fetch("/api/contexto-activo/set", {
         method: "POST", headers: { "Content-Type": "application/json" },
         credentials: "same-origin",
         body: JSON.stringify({ localId: elegido.id, esDeposito: esDep(elegido) }),
       });
       return JSON.stringify({
         grupo: g ? g.nombre : null,
         local: elegido.nombre,
         deposito: esDep(elegido),
         disponibles: items.map((l) => l.nombre + (esDep(l) ? " (depósito)" : "")),
         status: r.status,
       });
     })()`,
    true
  );
  const c = JSON.parse(contexto);
  if (c.error || c.status !== 200) {
    throw new Error(`No se pudo fijar el contexto: ${contexto}`);
  }
  log?.(`  contexto: grupo ${c.grupo ?? "(ninguno)"}, local ${c.local}${c.deposito ? " (depósito)" : ""}`);
  log?.(`  ubicaciones visibles: ${(c.disponibles || []).join(", ")}`);
  return c;
}

/** Los tres pasos en orden, que es como los usan los dos arneses. */
export async function prepararSesion({
  navegar, evaluar, base, usuario, clave, log, ubicacion = null,
}) {
  if (await sesionVigente({ navegar, evaluar, base })) {
    log?.("  sesión del perfil todavía vigente: no se repite el login");
  } else {
    await iniciarSesion({ navegar, evaluar, base, usuario, clave, log });
  }
  return fijarContexto({ evaluar, log, ubicacion });
}
