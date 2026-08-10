---
name: relevar
description: Relevamiento recursivo del repo — enumerar diciendo siempre con qué se enumeró, distinguiendo trackeado, untracked e ignorado, y sabiendo qué universo cubre cada herramienta.
context: fork
agent: auditor
allowed-tools: Glob, Grep, Read
---

# Relevar el repo sin dejar niveles afuera

Un conteo mal enumerado no se ve mal. Da un número, el número suena razonable, y
la conclusión que se apoya en él viaja como si estuviera verificada.

**Con qué se enumeró es parte de la afirmación.** "Son 54 scripts" sin decir cómo
se contaron no es un dato: es una impresión con formato de dato.

## Estado de Git de este repo, ahora

Esto se calcula **antes** del fork y llega ya resuelto. Adentro no hay Bash: no
se puede correr `git`, ni `git ls-files`, ni `git grep`. Estos números son la
única foto de Git disponible, y son de este instante.

- Archivos **trackeados**: !`git ls-files | wc -l`
- **Untracked no ignorados** (los que `git status` muestra con `??`): !`git status --porcelain | grep -c "^??"`
- Entradas **ignoradas** presentes en disco, con los directorios colapsados: !`git status --porcelain --ignored | grep -c "^!!"`
- Lo mismo contado archivo por archivo dentro de esas entradas: !`git status --porcelain --ignored=matching | grep -c "^!!"`

Las entradas ignoradas, una por línea:

!`git status --porcelain --ignored | grep "^!!" | sed "s/^!! //"`

## Los cuatro universos

No son tres. El tercero es el que deja ciegos a los relevamientos.

1. **Trackeado** — está en el índice de Git. Lo ve `git ls-files`.
2. **Untracked no ignorado** — está en disco, Git lo ve y lo reporta con `??`.
3. **En disco pero ignorado por `.gitignore`** — está ahí, funciona, se ejecuta,
   y **no aparece ni en `git ls-files` ni en `git status` a secas**. Hay que
   pedirlo con `--ignored`.
4. **Qué universo cubre cada herramienta** — abajo, medido.

El caso 3 no es teórico. Las cuatro skills de este mismo directorio eran
exactamente eso hasta hace un commit: existían en disco, cargaban y funcionaban,
no estaban trackeadas, y `git status` **tampoco las mostraba como untracked**
porque `.gitignore` tenía `.claude/*`. Un relevamiento que solo mira los dos
primeros universos habría informado que no existían.

Mirando la lista de arriba: ahí adentro hay archivos que importan y que un
relevamiento normal no ve.

## Alcance real de cada herramienta, medido en este repo

Medido con `*.sql`, que es donde se separan:

- **`Glob`** — recursivo sin necesidad de `**/`, y **NO respeta `.gitignore`**.
  Con `*.sql` devolvió **85** archivos: los 82 trackeados **más** tres ignorados
  (`backup_erpazul.sql`, `diff.sql`, `fix_column.sql`).
  Es la única herramienta del fork que alcanza el universo 3.
- **`Grep`** (ripgrep) — recursivo, y **SÍ respeta `.gitignore`**. Buscar una
  frase que está en un archivo ignorado devolvió **nada**; pasándole ese archivo
  como `path` explícito, lo encontró. O sea: el archivo estaba, el filtro lo
  escondía.
- **`Read`** — no enumera. Abre lo que se le pida, ignorado o no.

Fuera del fork, en el hilo principal:

- **`git ls-files`** — repo entero, solo universo 1.
- **`git grep`** — repo entero, solo universo 1. **No está disponible dentro de
  esta skill**: el auditor no tiene Bash. Si hace falta una búsqueda de Git
  puntual, se pide en el hilo principal.
- **`ls *.sql`** en la raíz → 3 archivos. El glob del shell mira **un solo
  nivel**.
- **`fs.readdirSync`** → un solo nivel. **`find -maxdepth N`** → lo que se le
  diga.

**La consecuencia práctica:** un conteo hecho solo con `Grep` está ciego a lo
ignorado. Uno hecho solo con `git ls-files` también. **Glob es el que ve el
disco.** Cuando la pregunta es "qué hay realmente acá", la respuesta sale de
Glob; cuando es "qué hay en el repo", de la lista de trackeados de arriba. Son
preguntas distintas y hay que decir cuál se contestó.

Y ojo con las coincidencias: con `*.test.mjs`, Glob y `git ls-files` dan los dos
**91**. No porque sean equivalentes, sino porque no hay ningún `.test.mjs`
ignorado. Que dos métodos coincidan una vez no los vuelve intercambiables.

## Contar ignorados: el modo cambia el número

`git status --ignored` **colapsa directorios enteros en una sola entrada**
(`node_modules/` cuenta como 1). Con `--ignored=matching` los expande. En este
repo eso es la diferencia entre los dos números de arriba, y **ninguno de los
dos está mal**: contestan preguntas distintas. Decir cuál se usó es parte del
número.

## El caso que originó la regla

`scripts/generador/fix-admin-role.js` hace `rol.update` sobre el rol Admin, sin
ninguna validación y heredando el `.env`. Fue **invisible en tres auditorías
seguidas de scripts**, porque estaban hechas con `fs.readdirSync` sobre
`scripts/`, y él vive en un subdirectorio. Estuvo todo el tiempo en la lista de
los peligrosos sin que ninguna pasada lo viera.

## El otro caso: enumerar por el patrón equivocado

`confirmar/route.js` no apareció en el primer relevamiento de rutas que
reconcilian, porque **no llama a `conciliarFila`** —hace un `update` directo— y
el patrón buscado no lo encontraba. Era el único de los tres que escribía la
autoría de una decisión.

De ahí la segunda mitad de la regla: **el patrón también es una enumeración, y
también puede mirar un solo nivel.** Buscar quién llama a una función encuentra a
los que la llaman, no a los que hacen lo mismo por otro camino.

En la práctica, cuando se busca "quiénes hacen X":

1. Buscar por el nombre de la función o del helper.
2. Buscar por el **efecto** — el nombre del campo que se escribe, el modelo, la
   tabla — que encuentra a los que lo hacen a mano.
3. Buscar por los **envoltorios**: si la ruta usa `requireAdmin` o `resolveScope`
   en vez de llamar directo al helper que se busca, el grep del helper no la ve.
   Enumerar los envoltorios y volver a buscar por cada uno. Este es el paso que
   se saltea, y es el que hizo pasar un conteo de rutas de 18 a 8 a 0 en la misma
   tanda.

## Campos compartidos: todos los lectores, no los del archivo que se toca

Antes de cambiar un campo compartido, buscar **su nombre en todo el repo**, no
solo donde se lo está por cambiar.

Buscar `aumentoEsperadoMinPct` dio **cinco lectores en cuatro archivos**, tres de
ellos componentes que no estaban en el plan. Buscar el rango de aumento esperado
dio cinco lugares distintos, tres con `?? 10` y `?? 20` escritos a mano: cambiar
la constante no los habría tocado.

Y buscar el default de un valor no es buscar la constante — es buscar también el
literal. Un `?? 10` no aparece en ningún grep del nombre de la constante.

## Cómo se informa un conteo

Siempre con las tres cosas juntas:

1. **El número.**
2. **Con qué se enumeró**, textual: la herramienta y el patrón.
3. **Qué universo cubre y qué queda afuera**: si incluye lo ignorado, si incluye
   lo untracked, qué caminos alternativos no cubre el patrón.

Ejemplo de la forma correcta: *"85 archivos `.sql`, enumerados con Glob `*.sql`,
que ve el disco entero incluidos los ignorados; de esos, 82 están trackeados."*

Y si un número cambió entre dos informes, **explicar el cambio antes de dar el
nuevo**: 2344 contra 2329 no fue una regresión, fue que un conteo enumeró todo el
repo y el otro solo `lib/`.

## Antes de cerrar el relevamiento

- ¿La enumeración recorre todos los niveles, o solo el primero?
- ¿Cubre lo ignorado, o la herramienta lo filtró sin avisar?
- ¿El patrón cubre a los que hacen lo mismo por otro camino?
- ¿Hay envoltorios entre el llamador y lo que estoy buscando?
- ¿Qué queda afuera y lo dije?

Si alguna respuesta es "no sé", eso va en el informe. Un relevamiento que declara
su alcance vale; uno que da un número redondo sin decir de dónde salió, no.
