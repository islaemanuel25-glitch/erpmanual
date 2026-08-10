# DEC-0006 — Ningún script construye `PrismaClient` directo

**Estado:** Vigente

## Contexto

Un caso real, no una precaución: **`new PrismaClient()` sin argumentos no falla
cuando falta `DATABASE_URL`** — usa la del `.env`.

La auditoría encontró **23 scripts que escribían en `erpazul_dev` creyendo que
trabajaban en otro lado**, y **19 que hacían `TRUNCATE` de todas las tablas**,
protegidos únicamente por que la palabra "test" no apareciera en el nombre de esa
base.

## Decisión

Todos los scripts piden el cliente a **`scripts/lib/clientePrisma.mjs`**, que
**exige la URL de forma explícita y aborta con código 2 si falta**, en vez de
heredarla. La única excepción es la fábrica misma.

Tres niveles:

- **LECTURA** — URL explícita.
- **ESCRITURA** — además host local y `NODE_ENV` distinto de production.
- **DESTRUCTIVO** — además nombre exacto en lista blanca y `SEED_DESTRUCTIVO`
  igual a ese nombre.

Y la parte que se pasa por alto: **el nivel sigue al modo, no al script.** Uno con
dry-run pide LECTURA al simular y ESCRITURA al aplicar, así la simulación puede
auditar producción sin habilitar escrituras.

## Motivo

Heredar la conexión del entorno hace que el error sea silencioso: el script corre,
responde bien, y escribe en la base equivocada. Exigirla explícitamente convierte
un desastre silencioso en un fallo ruidoso.

## Consecuencias

- **La fábrica se importa ANTES que cualquier cosa que arrastre a Prisma**, en la
  práctica primero de todo. `@prisma/client` carga el `.env` al importarse, y la
  fábrica distingue "la puso el operador" de "la puso el archivo" capturando la
  variable antes de que eso ocurra. Si algo carga Prisma antes, la distinción se
  pierde en silencio.
- Corolario que cambió cómo se trabaja: **un paso de datos que corre en producción
  va como migración de Prisma, nunca como script.** Las migraciones tienen su
  lugar en el despliegue, quedan registradas y se aplican una sola vez.
- Estado verificado al 2026-08-10: de **85 scripts** `.js`/`.mjs`, **57 usan la
  fábrica** y **el único que construye `PrismaClient` directo es la fábrica**.
  Enumerado con `git ls-files "scripts/*.mjs" "scripts/*.js"` y
  `git grep -l "new PrismaClient" -- 'scripts/**'`.

## Evidencia

- `scripts/lib/clientePrisma.mjs`, introducido en `c5ec66a` *fix(scripts): fábrica
  de cliente Prisma con tres niveles, y los diez de mantenimiento migrados*.
- Migración del resto: `63bdbb7`, `64fb21a`, `af0e29a`.
- Cierre de la regla: `f7c806b` *chore(scripts): cerrar la regla — nadie construye
  PrismaClient por su cuenta*.
- Elevada a permanente en `CLAUDE.md`, sección "Scripts que tocan la base".
