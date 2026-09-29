// lib/deploy/recuperacionTipada.mjs
//
// LA FORMA DE UNA RECUPERACIÓN TIPADA, UNA SOLA VEZ.
//
// Una recuperación tipada es el único camino por el que la guardia deja pasar un
// `prisma migrate resolve`: un comando EXACTO que corre entero dentro del VPS,
// en un solo `ssh`, y encadena
//
//   1. un diagnóstico de SOLO LECTURA —un archivo de `scripts/deploy/`, desde el
//      checkout que el paso 1 del despliegue ya dejó en el commit nuevo—,
//      ejecutado con psql dentro del contenedor de la base, que sale con error
//      ante cualquier cosa que no sea el caso recuperable;
//   2. `&&`: el shell del VPS solo sigue si el diagnóstico salió con 0;
//   3. `resolve --rolled-back` de UNA migración, con la CLI de Prisma de la
//      imagen, igual que el paso 4 del despliegue corre `migrate deploy`.
//
// Por qué la igualdad y no una regla, y por qué nunca `--applied`, está en
// `recuperacionLibroStock.mjs`, que fue la primera. Acá vive solo la forma, para
// que la segunda —`recuperacionLibroCostos.mjs`— no la vuelva a escribir al lado.

// Las mismas piezas que el despliegue ya usa: el directorio del VPS, el
// contenedor de la base y el `docker compose run` del paso 4.
const DIR_VPS = "/srv/produccion/erpazul";
const PSQL_EN_LA_BASE = "docker exec -i erpazul_db psql -U erpazul -d erpazul -X -q -v ON_ERROR_STOP=1";
const PRISMA_DE_LA_IMAGEN = "docker compose -f docker-compose.prod.yml run --rm -T --no-deps app";

/** Lo que imprime un diagnóstico de recuperación en cada salida posible. */
export const RESULTADO = Object.freeze({
  RECUPERABLE: "CASO_1_RECUPERABLE",
  REVERTIDA: "REVERTIDA_LIMPIA",
  FRENAR: "FRENAR",
});

/** El único resolve que una recuperación tipada puede correr. */
export const resolveRevertido = (migracion) => `prisma migrate resolve --rolled-back ${migracion}`;

/** Un archivo SQL de solo lectura, corrido con psql dentro de la base. */
export const comandoPsql = (archivo, variables = "") =>
  `ssh vps-erp 'cd ${DIR_VPS} && ${PSQL_EN_LA_BASE}${variables} -f - < ${archivo}'`;

/** El diagnóstico solo, sin resolver nada. Modo `recuperar` o `revertida`. */
export const comandoDiagnosticoDe = (archivoDiagnostico, modo) => comandoPsql(archivoDiagnostico, ` -v modo=${modo}`);

/** EL comando: diagnóstico en modo recuperar `&&` el resolve --rolled-back. */
export const comandoRecuperacionDe = (archivoDiagnostico, migracion) =>
  `ssh vps-erp 'cd ${DIR_VPS} && ${PSQL_EN_LA_BASE} -v modo=recuperar -f - < ${archivoDiagnostico}` +
  ` && ${PRISMA_DE_LA_IMAGEN} ${resolveRevertido(migracion)}'`;

/** ¿Es `comando` exactamente `esperado`, salvo espacios al principio o al final? */
export const esExactamente = (comando, esperado) => typeof comando === "string" && comando.trim() === esperado;
