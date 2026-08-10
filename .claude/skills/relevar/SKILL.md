---
name: relevar
description: Relevamiento recursivo del repo — enumerar diciendo siempre con qué se enumeró, y desconfiar de todo conteo que no recorra todos los niveles.
context: fork
agent: auditor
allowed-tools: Glob, Grep, Read
---

# Relevar el repo sin dejar niveles afuera

Un conteo mal enumerado no se ve mal. Da un número, el número suena razonable, y
la conclusión que se apoya en él viaja como si estuviera verificada.

**Con qué se enumeró es parte de la afirmación.** "Son 54 scripts" sin decir cómo
se contaron no es un dato: es una impresión con formato de dato.

## Herramientas y su alcance real

Verificado en este repo, sobre `*.test.mjs`:

- `Glob` con patrón `*.test.mjs` → **91 archivos, recursivo**. El Glob de las
  herramientas recorre todo el árbol sin necesidad de `**/`.
- `git ls-files "*.test.mjs"` → **91**. Recorre el repo entero. Ve solo lo
  trackeado.
- `Grep` (ripgrep) → recursivo por default, respeta `.gitignore`.
- `ls *.test.mjs` en la raíz → **0 archivos**. El glob del shell mira un solo
  nivel.
- `fs.readdirSync` → un solo nivel. `find -maxdepth N` → lo que se le diga.

Los dos primeros coinciden y son los que sirven para afirmar un número. Los tres
últimos son los que ya mintieron.

**Ojo con lo no trackeado:** `git ls-files` no ve archivos sin agregar ni
ignorados. Si la pregunta es "qué hay en el disco" y no "qué hay en el repo",
`git ls-files` es la herramienta equivocada y hay que decirlo.

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
2. **Con qué se enumeró**, textual: el comando o la herramienta y el patrón.
3. **Qué queda afuera de esa enumeración**: lo no trackeado, lo ignorado, los
   caminos alternativos que el patrón no cubre.

Ejemplo de la forma correcta: *"91 candados, enumerados con
`git ls-files '*.test.mjs'`; no incluye archivos sin trackear ni los ignorados
por `.gitignore`."*

Y si un número cambió entre dos informes, **explicar el cambio antes de dar el
nuevo**: 2344 contra 2329 no fue una regresión, fue que un conteo enumeró todo el
repo y el otro solo `lib/`.

## Antes de cerrar el relevamiento

- ¿La enumeración recorre todos los niveles, o solo el primero?
- ¿El patrón cubre a los que hacen lo mismo por otro camino?
- ¿Hay envoltorios entre el llamador y lo que estoy buscando?
- ¿Qué queda afuera y lo dije?

Si alguna respuesta es "no sé", eso va en el informe. Un relevamiento que declara
su alcance vale; uno que da un número redondo sin decir de dónde salió, no.
