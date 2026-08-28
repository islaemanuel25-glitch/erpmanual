// ¿EL LÍMITE DE CONSULTAS AGUANTA VEINTICINCO PEDIDOS A LA VEZ?
//
// ── POR QUÉ NO ALCANZA UN CANDADO ─────────────────────────────────────────
//
// Los candados de `lib/ia/consumoDeIa.test.mjs` prueban la DECISIÓN: con 20 de
// 20, la consulta 21 no sale. Eso se puede probar con un contador de mentira.
//
// Lo que NO se puede probar así es la carrera: dos pedidos que cuentan al mismo
// tiempo, los dos leen 19, los dos insertan, y el día termina en 21. Esa
// ventana solo existe contra una base de verdad, y solo se ve lanzando pedidos
// de verdad al mismo tiempo.
//
// Y un candado dentro de Node no la cierra: la aplicación puede correr en
// varios procesos o en varios contenedores, y cada uno tendría el suyo. El
// único lugar que todos comparten es PostgreSQL.
//
// ── QUÉ HACE ──────────────────────────────────────────────────────────────
//
// Deja el contador en 19 de 20, lanza 25 reservas simultáneas mezclando las dos
// procedencias —importador y comprobantes— y comprueba que EXACTAMENTE UNA
// reserve y el total quede en 20. Después borra lo que escribió.
//
// Con `--sin-bloqueo` corre la contraprueba: la misma prueba con la versión
// ingenua —contar y después insertar— que es la que tenía el código antes. Ahí
// se pasa de 20, y ése es el punto.
//
// NO LLAMA A NINGUNA IA. Solo escribe filas del contador en la base de
// desarrollo. Cero consultas reales.
//
// Uso:
//   DATABASE_URL=<la de desarrollo> node scripts/probar-limite-atomico.mjs
//   DATABASE_URL=<la de desarrollo> node scripts/probar-limite-atomico.mjs --sin-bloqueo

import { crearClientePrisma } from "./lib/clientePrisma.mjs";

const SIN_BLOQUEO = process.argv.includes("--sin-bloqueo");
const LLAVE = 826_2026;
const LIMITE = 20;
const CUANTAS = 25;
const MODELO_MARCA = "prueba-limite-atomico";

const prisma = await crearClientePrisma({ nivel: "escritura" });

// ── EL ÁMBITO DE LA PRUEBA ──────────────────────────────────────────────
//
// Se cuentan SOLO las filas de esta prueba, no las reales que ya haya en la base
// de desarrollo. No es una comodidad: contar las reales haría que el resultado
// dependiera de cuántas lecturas se hicieron ese día, y una prueba que da
// distinto según el día no prueba nada. La base ya tenía veinte filas reales de
// hoy y la prueba abortó por eso, que fue el aviso.
//
// Lo que se está midiendo es la CARRERA —contar e insertar sin que otro se meta
// en el medio— y esa propiedad no depende del filtro.
const AMBITO = { modelo: { startsWith: MODELO_MARCA } };

/** La reserva BUENA: cuenta e inserta adentro del mismo bloqueo. */
async function reservarAtomica(marca) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LLAVE}::bigint)`;
    const usadas = await tx.llamadaLector.count({ where: AMBITO });
    if (usadas >= LIMITE) return { ok: false, usadas };
    const fila = await tx.llamadaLector.create({
      data: { modelo: marca, ok: false, motivo: "EN_CURSO" },
      select: { id: true },
    });
    return { ok: true, id: fila.id, usadas: usadas + 1 };
  });
}

/** La reserva INGENUA: contar y después insertar, sin nada que las una. */
async function reservarIngenua(marca) {
  const usadas = await prisma.llamadaLector.count({ where: AMBITO });
  if (usadas >= LIMITE) return { ok: false, usadas };
  // El respiro no fabrica el problema: lo hace VISIBLE. La ventana existe igual
  // —entre el count y el insert hay ida y vuelta a la base— y sin esto el
  // resultado dependería de la latencia de la máquina, que es justo lo que no
  // se quiere en una prueba.
  await new Promise((r) => setTimeout(r, 15));
  const fila = await prisma.llamadaLector.create({
    data: { modelo: marca, ok: false, motivo: "EN_CURSO" },
    select: { id: true },
  });
  return { ok: true, id: fila.id, usadas: usadas + 1 };
}

async function limpiar() {
  await prisma.llamadaLector.deleteMany({ where: { modelo: { startsWith: MODELO_MARCA } } });
}

async function principal() {
  console.log(`\n${SIN_BLOQUEO ? "CONTRAPRUEBA (sin bloqueo)" : "PRUEBA (con bloqueo de PostgreSQL)"}`);
  console.log(`base: ${process.env.DATABASE_URL?.replace(/:\/\/[^@]*@/, "://***@")}`);

  await limpiar();

  // Se deja el contador en 19 de 20. Las filas llevan la marca para poder
  // borrarlas después sin tocar ninguna real.
  const previas = [];
  for (let i = 0; i < LIMITE - 1; i += 1) {
    previas.push({ modelo: `${MODELO_MARCA}-previa`, ok: false, motivo: "EN_CURSO" });
  }
  await prisma.llamadaLector.createMany({ data: previas });

  const arranque = await prisma.llamadaLector.count({ where: AMBITO });
  console.log(`contador antes: ${arranque} de ${LIMITE}`);
  if (arranque !== LIMITE - 1) {
    console.error(`ABORTADO: se esperaba arrancar en ${LIMITE - 1} y hay ${arranque}. ¿Quedaron filas de otra corrida?`);
    await limpiar();
    process.exit(2);
  }

  // ── LAS VEINTICINCO, DE VERDAD AL MISMO TIEMPO ────────────────────────
  //
  // Se mezclan las dos procedencias a propósito: el pedido era que importador y
  // comprobantes compartan el contador, y compartirlo significa que se estorban
  // entre ellos.
  const reservar = SIN_BLOQUEO ? reservarIngenua : reservarAtomica;
  const pedidos = Array.from({ length: CUANTAS }, (_, i) =>
    reservar(`${MODELO_MARCA}-${i % 2 === 0 ? "importador" : "comprobantes"}`)
  );
  const resultados = await Promise.allSettled(pedidos);

  const reservaron = resultados.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  const bloqueados = resultados.filter((r) => r.status === "fulfilled" && !r.value.ok).length;
  const explotaron = resultados.filter((r) => r.status === "rejected");
  const final = await prisma.llamadaLector.count({ where: AMBITO });

  console.log(`reservaron:  ${reservaron}`);
  console.log(`bloqueadas:  ${bloqueados}`);
  console.log(`explotaron:  ${explotaron.length}`);
  console.log(`contador final: ${final}`);
  if (explotaron.length) console.log(`  primer error: ${explotaron[0].reason?.message?.slice(0, 120)}`);

  await limpiar();
  const quedan = await prisma.llamadaLector.count({ where: { modelo: { startsWith: MODELO_MARCA } } });
  console.log(`filas de prueba que quedaron: ${quedan}`);

  const bien = reservaron === 1 && bloqueados === CUANTAS - 1 && final === LIMITE && quedan === 0;

  if (SIN_BLOQUEO) {
    // La contraprueba tiene que FALLAR el criterio. Si lo cumpliera, el bloqueo
    // no estaría arreglando nada y la prueba de arriba no probaría nada.
    if (bien) {
      console.error("\nROJO · la versión SIN bloqueo también respetó el tope: la prueba no distingue nada.");
      process.exit(1);
    }
    console.log(`\nVERDE · la contraprueba se pasó del tope, como tenía que pasar: ${final} de ${LIMITE}.`);
    process.exit(0);
  }

  if (!bien) {
    console.error("\nROJO · el límite NO aguantó los 25 pedidos simultáneos.");
    process.exit(1);
  }
  console.log(`\nVERDE · una sola reservó, 24 bloqueadas, el contador quedó en ${final} y nunca en 21.`);
  process.exit(0);
}

principal().catch(async (e) => {
  console.error("ABORTADO:", e.message);
  try { await limpiar(); } catch {}
  process.exit(2);
});
