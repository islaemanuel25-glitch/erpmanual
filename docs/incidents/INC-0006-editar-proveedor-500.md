# INC-0006 — Editar un proveedor devuelve 500 desde el 2026-07-26, y nadie lo ve

**Fecha:** 2026-08-14
**Estado:** arreglado en local el 2026-08-14, **sin desplegar todavía**.
**Alcance:** `/modulos/proveedores`, el lápiz de cada fila y cualquier entrada
por `?editar=<id>`. **Está en producción.**

## Qué pasa

**El modal de editar proveedor no abre nunca.** Medido con sesión real contra
`erpazul_dev`: **0 de 7 corridas**, determinista, entrando por
`/modulos/proveedores?editar=5`. Y por el camino normal es lo mismo: tocar el
lápiz de una fila navega a `/modulos/proveedores?editar=5` y ahí se queda.

**No se ve ningún error.** La pantalla no dibuja nada, no salta ningún cartel y
la URL conserva el parámetro. Desde afuera parece que el botón no hace nada.

Apareció **de rebote**, relevando si la carrera del `?editar=` de productos
estaba también en las otras siete pantallas que usan la convención. No lo es:
la URL sobrevive las siete veces. Es otra cosa, y peor.

## La causa, medida

Pidiendo la API desde la propia página, con su cookie:

    /api/proveedores/obtener?id=5  →  500  {"ok":false,"error":"Error interno"}

Y en el log del servidor, `PrismaClientValidationError` sobre
`prisma.proveedor.findFirst()`: **`grupoId` no es un argumento válido de
`ProveedorWhereInput`**.

`app/api/proveedores/obtener/route.js:42` filtra así:

    where: { id, grupoId: scope.grupoId }

**`Proveedor` no tiene `grupoId`, y el schema lo dice con todas las letras** en
el comentario de `prisma/schema.prisma:248`: *"`Proveedor` no tiene `grupoId` —es
compartido entre grupos, y las tablas que cuelgan de él llevan el suyo—"*.

## Desde cuándo, y si está desplegado

Lo introdujo `ba94fc2` el **2026-07-26**, `fix(security): completar aislamiento y
permisos por local`. **Está en `42e7e27`, que es el commit que corre hoy en
producción**, así que el botón viene roto desde esa fecha: diecinueve días al
escribir esto.

## Por qué no lo atrapó nada

Es la misma familia que la caída de comprobantes del 2026-08-12 —la del
`productoLocal` que no existía— y por los mismos dos motivos, los dos ya escritos
en `CLAUDE.md`:

1. **Una consulta de Prisma no la mira ni el build ni los candados.** El proyecto
   es JavaScript, así que Next compila sin revisar los argumentos, y los candados
   son funciones puras que no tocan la base. Falla recién contra Postgres — y
   habría fallado igual contra una base vacía, porque lo que se valida son los
   ARGUMENTOS y no el resultado.
2. **"Error interno" no dice nada.** El `catch` de la ruta tapa un mensaje que
   nombraba el campo exacto. Es la deuda anotada de los **188 archivos bajo
   `app/api` que contestan lo mismo**: el candado de mensajes que explican cubre
   solo las rutas del módulo de comprobante, y esta no es una de ellas.

## LA REGLA DE NEGOCIO, DECIDIDA — y el chequeo que se le hizo antes de aplicarla

**Decidido por Emanuel el 2026-08-14: cada local tiene sus propios proveedores.**
Un proveedor cargado en un local no se ve desde los otros.

Antes de aplicarla se preguntó contra los datos si esconde algo en uso. Corrido
contra **`erpazul_dev`** — dos locales, `depo` (1) y `mini el 7` (2), grupo 1, 42
proveedores — y usando **el predicado real del repo**, no una copia:

- **Proveedores con productos o pedidos en un local distinto del que los creó:
  42, o sea todos.** Pero **no por lo que la pregunta buscaba**: los 42 tienen
  `creadoEnLocalId` en **null**. Son filas viejas, anteriores al campo. La ruta de
  crear sí lo escribe hoy (`crear/route.js:23`), así que un proveedor nuevo nace
  con su local puesto.
- **Proveedores que quedarían invisibles en un local donde se los usa: 0.**

**Ese segundo número es el que decide**, y es el que la consigna pedía de verdad:
"que la regla no esconda nada que hoy esté en uso". Tener productos en otro local
no rompe nada por sí solo — el predicado hace visible al proveedor justamente
donde tiene productos. Lo que rompería es un uso **sin** productos ahí, y de eso
no hay ninguno.

**Y hay un argumento que lo refuerza:** la ruta del LISTADO ya usaba
`proveedorVisibleWhere` desde antes. O sea que la regla **ya estaba viva** y esta
ruta era la única que no la respetaba. Aplicarla no esconde nada nuevo: hace que
la ficha coincida con la lista de la que se entra.

**Sin verificar:** todo esto se midió contra `erpazul_dev`, no contra producción.

## El arreglo, y las TRES cosas que estaban mal

**1. El campo que no existe.** `where: { id, grupoId: scope.grupoId }` pasó a
`where: { id, ...proveedorVisibleWhere(scope.localId, scope.grupoId) }`. Se reusa
el predicado canónico y no se escribe una condición parecida al lado.

**2. Y había un SEGUNDO desacuerdo, que apareció recién al ejercerlo.** Con el
predicado ya puesto, la ficha seguía dando **404 en el local donde el proveedor sí
tiene sus productos**, mientras el listado lo devolvía. El motivo: esta ruta
resolvía el alcance con `resolveGrupo` y el listado con `resolveLocalAndGrupo`.
**Dos resolutores distintos para la misma pregunta**, y por eso contestaban
distinto. Ahora usa el mismo que el listado.

Esto **no lo habría encontrado ninguna lectura del código**: las dos funciones se
llaman parecido y las dos devuelven un `grupoId`. Lo encontró correrlo.

**3. La pantalla tiraba el error.** Los dos `fetch` de lectura de
`proveedores/page.jsx` preguntaban por el caso bueno y no tenían rama para el
malo. Un 500 se veía **exactamente igual que un botón que no hace nada**. Ahora
se muestra, con un texto que distingue los dos casos: un 404 no es una falla, es
la regla diciendo que ese proveedor no es de este local.

**Y esa tercera parte se rompió una vez más antes de quedar bien**, con un solo
estado `errorMsg`: el listado terminaba después que la ficha y **borraba el aviso**
que la ficha había puesto. Compilaba y el candado estaba en verde. **Lo encontró
mirar la captura.** Quedaron dos estados, cada consulta dueña del suyo, y el
candado ahora exige que sigan siendo dos.

## Verificado ejerciendo

Con sesión real, siete corridas por local, en los dos locales:

- **`depo`: abre 7 de 7**, y la API contesta 200 con el proveedor.
- **`mini el 7`: 0 de 7, con 404** — que es lo correcto: la regla dice que ese
  proveedor no es de ese local. **Y el listado de ese local devuelve `items: []`**,
  o sea que la ficha y la lista por fin dicen lo mismo.
- **El aviso se ve**, comprobado en la captura: "Ese proveedor no es de este
  local. Cada local tiene sus propios proveedores."

Antes del arreglo: **0 de 7 con 500**, en los dos locales.

## Qué cierra esto, y qué NO

Se agregó `lib/visibilidad.proveedores.test.mjs`, con la contraprueba hecha:
restaurando el `grupoId` viejo, el candado se pone en rojo nombrando archivo y
línea.

**Cierra**, para todo el repo: que ninguna ruta acote `Proveedor` por `grupoId`;
que las cinco rutas que acotan proveedores por ubicación usen el predicado
compartido; que esta ruta no vuelva a contestar un mensaje mudo; y que esta
pantalla no vuelva a descartar una respuesta en silencio.

**NO cierra**, y conviene que quede dicho:

- **La validez de las consultas de Prisma en general.** Un campo mal escrito que
  no sea `grupoId` sobre `Proveedor` pasa igual. Eso solo lo atrapa ejercer la
  consulta contra Postgres. Sigue siendo lo que dice el `CLAUDE.md`.
- **Los mensajes mudos.** El candado que los prohíbe está acotado a las rutas de
  comprobantes. Contadas hoy: **18 rutas bajo `app/api/proveedores` y 206 en todo
  `app/api`** siguen contestando "Error interno". Este arreglo tapó **una**.
- **Las pantallas que descartan errores.** Se arregló la de proveedores. No se
  relevó cuántas más hacen lo mismo.

## Lo que queda sin verificar

**No se comprobó contra producción**, ni el defecto ni el arreglo. Todo se midió
contra `erpazul_dev`. Lo que sí está comprobado es que **el código desplegado
tiene la línea mala**, así que el 500 en producción es esperable — pero esperable
no es medido.

**Y el arreglo no está desplegado.** Hasta que se despliegue, el botón sigue roto
para Emanuel.

**Nota de método:** la auditoría de datos se corrió con un cliente Prisma armado
fuera de `scripts/`, sin la fábrica. El motivo está escrito en el archivo: la
fábrica exige que la URL la ponga el operador, y para pasársela habría que leer el
`.env`, que el guardia de permisos bloquea — con razón. Es de solo lectura y la
corrida imprime contra qué base se conectó, que fue `erpazul_dev`.
