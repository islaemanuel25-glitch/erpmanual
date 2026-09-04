# Snapshot de la estructura de producción — CONGELADO

**Esto es una fotografía, no un contrato.** Se tomó una vez, para una cosa, y no
se actualiza sola.

## Qué es

| | |
|---|---|
| Fecha de captura | **2026-09-04** |
| SHA de `main` representado | **e42daab65ddc24106ad6d4851e5256a452419e19** |
| Cómo se obtuvo | `SELECT` sobre `pg_tables`, `information_schema.columns`, `pg_enum`, `pg_indexes`, `pg_constraint` y `_prisma_migrations` |
| Datos comerciales | **ninguno** |
| Credenciales | **ninguna** |

Los archivos son listas de **nombres**: tablas, columnas, índices con su
definición, enums con sus valores, constraints, y los 105 nombres de migración
que había en `_prisma_migrations`. No hay una sola fila de negocio.

## Para qué existe

Para una sola cosa: **demostrar que la baseline saneada
(`000000000000_squashed_migrations`) reproduce la estructura que producción
realmente tenía en el momento del squash.**

Sin esto, la única forma de comprobarlo habría sido conectar el CI a producción,
que es exactamente lo que no puede existir.

## Para qué NO existe, y esto es lo importante

**No es una exigencia de igualdad para las ramas que vengan.** Una migración
legítima hace que su rama difiera de esta fotografía —y tiene que diferir, hasta
que se despliegue—. Tratar el snapshot como contrato convertiría cada cambio de
esquema en un rojo, y a la tercera vez nadie miraría el chequeo.

Lo que el CI comprueba **hacia adelante**, en todas las ramas, es la cadena que
sí tiene que valer siempre:

    migraciones → base vacía → schema.prisma

es decir: que las migraciones construyan una base desde cero y que esa base no
tenga deriva contra `schema.prisma`. Eso no menciona a producción y no envejece.

La comparación contra este snapshot queda para el saneamiento y para una
verificación explícita de deriva de producción, cuando alguien la pida.

## Si alguna vez hay que actualizarlo

Nunca automáticamente, y nunca desde el CI. Las cuatro condiciones:

1. **Explícito** — porque alguien decidió actualizarlo, no como efecto lateral.
2. **Solo lectura contra producción** — los mismos `SELECT` de metadata.
3. **Revisado** — mirando qué cambió y por qué, no aceptando el diff a ciegas.
4. **Commiteado deliberadamente**, con el motivo en el mensaje.

Un snapshot que se regenera solo deja de ser evidencia: pasa a ser un espejo que
siempre confirma lo que hay, incluido lo que alguien rompió.

## Las diferencias que ya estaban aceptadas al 2026-09-04

Medidas y documentadas cuando se creó la baseline. `scripts/pruebas-db/comparar-con-produccion.mjs`
las lleva enumeradas una por una y falla ante cualquier otra:

- **`ListaPrecio_grupoId_nombre_key`** — en producción es un *constraint*; una
  base nueva lo crea como *índice único*. La garantía de unicidad es la misma y
  las cinco FK que apuntan a `ListaPrecio` van todas contra `id`.
- **`EstadoComprobante` y `TipoCoincidenciaLista`** — mismos valores, distinto
  orden. Es la huella de `ALTER TYPE … ADD VALUE`, que agrega al final. Ningún
  código ordena ni compara por rango sobre esas dos columnas.

## Lo que este snapshot NO cubre

Los nueve objetos que Prisma no sabe expresar —ocho índices parciales y el CHECK
de combos— están en las listas de acá, pero quien los **custodia** es
`scripts/pruebas-db/estructura.mjs`, que los busca en la base construida y
compara sus predicados. `prisma migrate diff` no los ve: están fuera de su
modelo de datos, y por eso su silencio sobre ellos no prueba nada.
