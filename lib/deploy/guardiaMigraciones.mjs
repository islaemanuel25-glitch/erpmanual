// lib/deploy/guardiaMigraciones.mjs
//
// La decisión de la guardia de migraciones, separada del hook que la ejecuta.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL HOOK ──────────────────────────────────
//
// Estaba toda pegada al lector de stdin, y eso la volvía imposible de testear:
// para ejercer un caso había que levantar un proceso y hablarle por tubería. Un
// control que decide si algo toca producción tiene que tener candados que se
// puedan leer, así que la parte que decide vive acá y es una función pura.
//
// ── Y POR QUÉ LA EXTENSIÓN ES .mjs, QUE NO ES UN DETALLE ────────────────────
//
// Era `.js`. Este repo NO declara `"type": "module"` en package.json, así que
// para Node un `.js` es CommonJS salvo que el motor detecte la sintaxis — algo
// que Node 20.19+ y 22.7+ hacen y **Node 18 no**.
//
// El hook lo importaba con `import { … } from "./guardiaMigraciones.js"`. En
// una máquina con Node 18 —el VPS de producción tiene v18.19.1— eso lanza un
// SyntaxError ANTES de ejecutar una sola línea: el proceso muere sin escribir la
// decisión, y Claude Code, sin decisión, deja pasar el comando. **La guardia no
// se apagó por una regla mal escrita: se apagó por una extensión de archivo.**
//
// Con `.mjs` es ESM explícito en cualquier Node, sin depender del motor. La
// cadena entera de la guardia —hook, esta decisión y el resolutor del SHA— es
// `.mjs` por la misma razón, y hay un candado que se pone rojo si alguien mete
// un `.js` en el medio.
//
// ── LOS TRES CAMINOS ────────────────────────────────────────────────────────
//
// 1. Un comando de la LISTA DE RECHAZO → se rechaza SIEMPRE, sin escape.
// 2. `prisma migrate deploy` con autorización manual → pasa, PERO AVISA.
// 3. `prisma migrate deploy` sin autorizar → se manda a clasificar.
//
// Cualquier otro comando no es asunto de la guardia y pasa sin decir nada.

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CRITERIO DE LA LISTA DE RECHAZO — leer antes de tocarla
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un comando entra en la lista si cumple LAS DOS condiciones:
 *
 *   A. Puede destruir datos o esquema, o puede FALSEAR el estado de las
 *      migraciones — que es igual de grave, porque el despliegue verifica
 *      contra ese estado y un estado mentido hace que la verificación mienta.
 *
 *   B. No hace falta para el trabajo de todos los días. Lo que sí hace falta
 *      NO se tapa, aunque sea peligroso: se informa y decide Emanuel. Una
 *      guardia que estorba todos los días se termina apagando, y ahí deja de
 *      proteger de todo.
 *
 * La condición B es la que explica las ausencias, y las ausencias son la parte
 * que más se malinterpreta. Están abajo, en NO_TAPADOS, con el motivo de cada
 * una. No son olvidos.
 *
 * ── SI APARECE UN COMANDO NUEVO, SE AGREGA A LA LISTA ──────────────────────
 *
 * No se hace una excepción, no se le agrega un `if` al lado, y NO se le pone
 * una variable de escape a ninguno. La lista es un solo lugar a propósito:
 * mientras haya un solo lugar, agregar el próximo cuesta una línea y un candado.
 * En cuanto haya dos mecanismos, el que revise va a mirar uno y creer que vio
 * los dos.
 *
 * Y si algún día uno de estos hace falta de verdad: se habla con Emanuel y se
 * saca de la lista A PROPÓSITO, diciendo en el commit qué caso lo justificó.
 * Que ese trámite cueste es el punto, no un efecto secundario.
 *
 * ── DE DÓNDE SALIÓ LA LISTA ────────────────────────────────────────────────
 *
 * De enumerar el CLI instalado, no de acordarse: `prisma --help` de la 6.19.3
 * más los sub-help de `db` y de `migrate`. Si se actualiza Prisma y aparecen
 * subcomandos nuevos, se vuelve a enumerar así.
 */
export const RECHAZADOS = [
  {
    nombre: "prisma db push",
    patron: /\bdb\s+push\b/,
    que: "Compara schema.prisma contra la base, calcula la diferencia y la ejecuta.",
    porque:
      "No deja archivo de migración. Si la diferencia incluye tirar una columna, " +
      "la tira con los datos adentro y no queda ni la sentencia que lo hizo. No " +
      "hay nada que revisar antes ni nada que leer después. Tampoco lo cubre el " +
      "clasificador, que lee archivos de migración: acá no hay archivo que leer.",
  },
  {
    nombre: "prisma migrate reset",
    patron: /\bmigrate\s+reset\b/,
    que: "Borra la base entera, la vuelve a crear, reaplica todas las migraciones y corre el seed.",
    porque:
      "Es el más destructivo del CLI y lo dice su propia ayuda: «all data will " +
      "be lost». No hay ninguna versión suave: no pregunta qué borrar, borra " +
      "todo. Apunta a donde apunte DATABASE_URL, y en este proyecto ya hubo 23 " +
      "scripts escribiendo en una base distinta de la que creían.",
  },
  {
    nombre: "prisma db execute",
    patron: /\bdb\s+execute\b/,
    que: "Manda SQL crudo a la base, desde un archivo (--file) o desde la entrada estándar (--stdin).",
    porque:
      "Ejecuta cualquier cosa: un DROP TABLE, un DELETE sin WHERE, un TRUNCATE. " +
      "Y acepta --url, o sea que la base destino se escribe en la misma línea y " +
      "no depende del .env — puede apuntar a producción sin que nada del entorno " +
      "lo delate. Es además la mitad que faltaba del camino peligroso de " +
      "`migrate diff --script`: ese genera el SQL, este lo aplica. Cerrando este " +
      "se cierran los dos.",
  },
  {
    nombre: "prisma migrate resolve",
    patron: /\bmigrate\s+resolve\b/,
    que: "Marca una migración como aplicada (--applied) o como revertida (--rolled-back) SIN ejecutarla.",
    porque:
      "No toca los datos: falsea el registro. Escribe en _prisma_migrations que " +
      "algo pasó cuando no pasó, y esa es justamente la tabla contra la que el " +
      "despliegue verifica que las migraciones se aplicaron. Un estado mentido " +
      "hace que la verificación de cierre dé bien y el esquema esté mal, que es " +
      "peor que fallar: el error queda tapado por su propio control.",
  },
];

/**
 * Lo que se miró y NO se tapó, con el motivo. Está acá y no en un documento
 * aparte para que quien lea la lista de rechazo vea en la misma pantalla por
 * qué estos no están, y no lo lea como un descuido.
 *
 * Los cuatro cumplen la condición A —pueden hacer daño— y ninguno cumple la B:
 * los cuatro hacen falta. Por eso se informan en vez de taparse.
 */
export const NO_TAPADOS = [
  {
    nombre: "prisma migrate dev",
    riesgo:
      "Puede decidir que necesita resetear la base cuando detecta que el esquema " +
      "se desvió, y apunta a donde diga DATABASE_URL.",
    porque_no_se_tapa:
      "Es el comando con el que se trabaja el esquema todos los días. Taparlo " +
      "sería taparle el trabajo normal a quien desarrolla, y la guardia entera " +
      "terminaría desactivada.",
  },
  {
    nombre: "prisma studio",
    riesgo: "Abre una interfaz que edita y borra cualquier fila de la base a la que apunte.",
    porque_no_se_tapa:
      "No destruye al invocarse: abre una ventana. El daño lo haría una persona " +
      "haciendo clic, y eso no lo puede distinguir un match sobre el texto del " +
      "comando.",
  },
  {
    nombre: "prisma db seed",
    riesgo: "Corre el script de seed, que puede hacer cualquier cosa, incluido vaciar tablas.",
    porque_no_se_tapa:
      "Ya está protegido más adentro y mejor: los scripts de este repo piden el " +
      "cliente a scripts/lib/clientePrisma.mjs, que exige URL explícita y, para " +
      "vaciar, nombre en lista blanca más SEED_DESTRUCTIVO. Taparlo acá sería un " +
      "segundo control peor que el que ya hay.",
  },
  {
    nombre: "prisma db pull",
    riesgo: "Sobrescribe schema.prisma con lo que haya en la base.",
    porque_no_se_tapa:
      "Destruye trabajo de archivo, no datos, y el archivo está en git. Es " +
      "recuperable con un checkout.",
  },
];

/** `migrate deploy` es el de producción. `migrate dev` es local y no entra acá. */
export const ES_MIGRACION_DE_PRODUCCION = /\bmigrate\s+deploy\b/;

/** La autorización explícita, adelante del comando y visible en la línea. */
export const AUTORIZADO = /\bDEPLOY_MIGRACION_AUTORIZADA\s*=\s*1\b/;

/**
 * Todos los rechazados exigen que el comando NOMBRE a prisma, no solo que
 * contenga el subcomando. Sin esto, un `git push` o un `docker push` caerían en
 * la lista y la guardia se volvería insoportable en un día.
 */
export const NOMBRA_PRISMA = /\bprisma\b/;

/** El rechazado que coincide con el comando, o null. */
export function comandoRechazado(comando) {
  const cmd = String(comando ?? "");
  if (!NOMBRA_PRISMA.test(cmd)) return null;
  return RECHAZADOS.find((r) => r.patron.test(cmd)) ?? null;
}

function razonDeRechazo(r) {
  return (
    `FRENADO Y SIN AUTORIZACIÓN POSIBLE: \`${r.nombre}\` está bloqueado en este repo, siempre.\n\n` +
    `Qué hace: ${r.que}\n\n` +
    `Por qué está bloqueado: ${r.porque}\n\n` +
    "No existe variable que lo habilite, a propósito. El criterio de la lista " +
    "está escrito en lib/deploy/guardiaMigraciones.mjs. Si de verdad hace falta " +
    "correrlo, es una conversación con Emanuel y un cambio deliberado a esa " +
    "lista — no un flag."
  );
}

const RAZON_AUTORIZADA =
  "Migración AUTORIZADA a mano con DEPLOY_MIGRACION_AUTORIZADA=1. La guardia NO " +
  "clasificó nada: la compatibilidad durante la ventana entre migrar y recrear " +
  "queda bajo la confirmación de Emanuel.\n\n" +
  "ESTO HAY QUE DECÍRSELO EN EL REPORTE, con estas palabras o parecidas: que se " +
  "usó la autorización manual, sobre qué comando, y que por eso el clasificador " +
  "no miró las migraciones que entraron. Antes el cartel de permiso era su " +
  "segundo control; sin cartel, este aviso es el único.";

const AVISO_AUTORIZADA =
  "GUARDIA: se usó la autorización manual de migraciones " +
  "(DEPLOY_MIGRACION_AUTORIZADA=1). El clasificador no revisó qué migraciones " +
  "entran.";

/**
 * Qué hacer con un comando, sin correr nada.
 *
 * Devuelve `accion`:
 *   "deny"       → se rechaza y no se consulta a nadie
 *   "allow"      → pasa
 *   "clasificar" → hay que correr el clasificador para poder decidir
 *
 * `aviso` es el texto que se le muestra a Emanuel en pantalla, o null cuando no
 * hay nada que mostrar. Se devuelve aparte de `razon` porque no son lo mismo:
 * la razón la lee quien está trabajando, el aviso lo ve él.
 */
export function decidirPorComando(comando) {
  const cmd = String(comando ?? "");

  // Primero de todo, y antes de mirar la autorización: no hay orden de los
  // factores que habilite un rechazado. Si un comando trajera las dos cosas,
  // gana el rechazo.
  const rechazado = comandoRechazado(cmd);
  if (rechazado) {
    return {
      accion: "deny",
      razon: razonDeRechazo(rechazado),
      aviso: `GUARDIA: se frenó un \`${rechazado.nombre}\`. Está bloqueado siempre y no tiene autorización posible.`,
      rechazado: rechazado.nombre,
    };
  }

  if (!ES_MIGRACION_DE_PRODUCCION.test(cmd)) {
    return { accion: "allow", razon: "", aviso: null };
  }

  if (AUTORIZADO.test(cmd)) {
    return { accion: "allow", razon: RAZON_AUTORIZADA, aviso: AVISO_AUTORIZADA };
  }

  return { accion: "clasificar", razon: "", aviso: null };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ HACER CON LO QUE CONTESTÓ EL CLASIFICADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estaba metido adentro del hook, en línea, y por eso no tenía candados: los
 * seis casos del contrato —cero migraciones, aditiva, marcada, SHA irresoluble,
 * rango degenerado y commit documental— se ejercían solo desplegando.
 *
 * Es una función pura sobre `{ status, salida }` para que se puedan escribir.
 *
 * ── LOS DOS SABORES DEL 2, QUE NO SON EL MISMO PROBLEMA ────────────────────
 *
 * El clasificador sale con 2 tanto cuando no pudo establecer la base como
 * cuando la base y el extremo son el mismo commit. Los dos frenan —y está
 * bien—, pero lo que hay que hacer es distinto: uno se arregla resolviendo el
 * SHA, el otro quiere decir que no hay nada que desplegar. Mezclarlos manda a
 * revisar ssh a alguien cuyo problema es que ya está todo desplegado.
 */
export const SALIDA_CLASIFICADOR = { LIMPIO: 0, MARCADO: 1, INDETERMINADO: 2 };

/** Marcas de texto con las que el clasificador distingue sus dos sabores de 2. */
const ES_RANGO_DEGENERADO = /rango es degenerado/i;
const NO_SE_PUDO_RESOLVER = /no se pudo establecer qué SHA está atendiendo/i;

export function decidirPorClasificacion({ status, salida = "" } = {}) {
  const texto = String(salida ?? "").trim();

  if (status === SALIDA_CLASIFICADOR.LIMPIO) {
    return {
      accion: "allow",
      razon:
        "Guardia de migraciones: el clasificador no encontró sentencias marcadas.\n\n" +
        texto,
      aviso: null,
    };
  }

  if (status === SALIDA_CLASIFICADOR.MARCADO) {
    return {
      accion: "deny",
      razon:
        "FRENADO: hay al menos una migración que rompería a la versión que está " +
        "atendiendo tráfico durante la ventana entre migrar y recrear.\n\n" +
        `${texto}\n\n` +
        "NO continuar por criterio propio. Informarle a Emanuel qué migración es, qué " +
        "sentencia la marcó y por qué rompería a la versión vieja, y esperar su " +
        "confirmación explícita. Si él confirma, el comando se repite con " +
        "DEPLOY_MIGRACION_AUTORIZADA=1 adelante.",
      aviso: "GUARDIA: se frenó una migración que rompería a la versión vieja durante la ventana.",
    };
  }

  if (ES_RANGO_DEGENERADO.test(texto)) {
    return {
      accion: "deny",
      razon:
        "FRENADO: la base y el extremo del rango son el mismo commit, así que no hay " +
        "nada que clasificar.\n\n" +
        `${texto}\n\n` +
        "Casi siempre significa que lo que se quiere desplegar YA está desplegado. Si " +
        "no es eso, mirá si el contenedor se recreó antes de tiempo, o pasá la base con " +
        "--desde <SHA>.",
      aviso: "GUARDIA: se frenó un despliegue cuyo rango es degenerado (la base ya es este árbol).",
    };
  }

  if (NO_SE_PUDO_RESOLVER.test(texto)) {
    return {
      accion: "deny",
      razon:
        "FRENADO: no se pudo establecer qué SHA está atendiendo, así que no se puede " +
        "decir qué migraciones entran.\n\n" +
        `${texto}\n\n` +
        "La salida explícita y auditable es correr el clasificador a mano con " +
        "--desde <SHA_QUE_ESTÁ_ATENDIENDO> y llevarle el resultado a Emanuel. NO " +
        "desactivar la guardia para seguir.",
      aviso: "GUARDIA: se frenó un despliegue porque no se pudo resolver el SHA desplegado.",
    };
  }

  return {
    accion: "deny",
    razon:
      "FRENADO: la guardia no pudo determinar qué migraciones entran, así que no puede " +
      "afirmar que sean compatibles.\n\n" +
      `${texto}\n\n` +
      "NO continuar por criterio propio. Un chequeo que no pudo mirar no es un chequeo " +
      "que pasó.",
    aviso: "GUARDIA: se frenó una migración porque el clasificador no pudo determinar qué entra.",
  };
}
