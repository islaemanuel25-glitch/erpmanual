# DEC-0011 — Los medios de cobro del POS se configuran por local

**Fecha:** 2026-09-05
**Estado:** VIGENTE — backend y dominio implementados y verificados en CI. Las
tres pantallas están diseñadas en Figma y todavía no construidas.
**Alcance:** qué botones ve el cajero al cobrar, cómo se llaman, en qué orden, por
qué procesador pasa la plata y con qué comisión.

## El problema

Los cuatro botones de cobro estaban escritos a mano en `FormaPago.jsx`, tres
veces en el mismo archivo. Un local que cobra por Mercado Pago con tres
modalidades distintas —débito, crédito y QR— no tenía forma de decirlo, y un
local que no acepta crédito tampoco tenía forma de sacarlo.

## Lo que NO se tocó, y es lo que ordena todo lo demás

`VentaPago` tiene `@@unique([ventaId, medio])`: **como máximo un cobro por medio
canónico por venta**, sobre 14.226 ventas históricas. Y `Venta.formaPago`,
`comisionBancaria` y `netoRecibido` siguen derivándose igual.

De ahí salen las dos decisiones que parecen arbitrarias y no lo son.

**Primera: el tipo contable y el nombre visible son cosas distintas.** El botón
se puede llamar "MP Débito"; lo que se congela en la venta es `DEBITO`. El nombre
es de la pantalla, el tipo es del sistema. Renombrar un medio no reescribe
ninguna venta vieja, y borrarlo tampoco: una venta de `DEBITO` sigue diciendo
`DEBITO` aunque el botón que la produjo ya no exista.

**Segunda: un local no puede tener dos medios ACTIVOS del mismo tipo contable.**
"Débito Banco" y "MP Débito" prendidos a la vez se configuran sin problema, pero
el día que un cajero parta un pago entre los dos, el segundo cobro viola esa
unicidad y **la venta se cae en la caja, con gente esperando**. La alternativa
era cambiar la clave de `VentaPago`, que es la verdad de esas 14.226 ventas. No
se cambió: se prohíbe la combinación que la rompería.

Y la segunda tiene una hermana que salió de la primera revisión: **después de
cualquier alta, edición o baja tiene que quedar al menos un medio activo.** Un
local sin medios activos es un POS que no puede cobrar.

Las dos reglas viven juntas en `validarMedios`, que recibe el estado
**resultante** —cómo quedaría el local— y no el cambio. Los tres verbos arman ese
resultado y preguntan ahí. No es estética: la primera versión tenía la regla del
último medio activo escrita dentro del DELETE, con un `count` propio, y el PATCH
no la tenía escrita en ningún lado, así que apagar el único medio activo dejaba
el POS sin botones por un camino y no por el otro. **Una regla escrita dos veces
es una regla que va a estar en un solo lado.**

La prohibición del tipo duplicado está escrita dos veces a propósito, y eso sí es
deliberado:

- `validarMedios` en `lib/pos-ventas/mediosCobro.js` la explica antes de escribir,
  diciendo la consecuencia y no la restricción.
- El índice parcial `MedioCobroLocal_tipo_activo_key` la garantiza en la base.

Una explica, la otra garantiza. Que alguien llegue a leer "duplicate key value
violates unique constraint" es haberle fallado. El índice es PARCIAL —`WHERE
"activo"`— porque los inactivos sí pueden convivir: guardar un medio apagado con
su configuración es justamente para qué sirve `activo`. Prisma no sabe expresar
un `WHERE` en un índice único, así que va a mano en la migración, como los otros
ocho parciales del esquema.

## Después de migrar no cambia nada, y no por un backfill

La migración **no siembra ni una fila**. La forma obvia habría sido escribir los
cuatro medios para cada local existente; no se hizo por dos motivos.

El primero: un backfill solo cubre los locales que existían el día del
despliegue. El local que se cree la semana que viene arrancaría sin medios y el
POS saldría sin botones. La compatibilidad no puede depender de haber corrido un
UPDATE una vez.

El segundo: **una fila sembrada es indistinguible de una decisión.** Si mañana se
agrega un medio al default del sistema, los locales rellenados no lo verían —ya
"tienen configuración"— y nadie sabría por qué.

Entonces la compatibilidad vive en la capa de dominio: un local sin filas usa
`MEDIOS_POR_DEFECTO`, que son exactamente los cuatro botones de hoy en el orden
de hoy, con los nombres que ya salían de `MEDIO_LABEL`. La primera edición desde
la pantalla materializa esos cuatro como filas y recién ahí manda la
configuración del local. Vale para los locales viejos, para los nuevos y para uno
creado dentro de cinco años.

Materializar los cuatro antes de aplicar el cambio no es un detalle: sin eso,
apagar "Crédito" dejaría al local con una sola fila —la de Crédito, apagada— y el
POS se quedaría sin los otros tres botones.

## Cómo se pide editar algo que todavía no existe

Un default no tiene fila, así que no tiene id. La primera versión de la API
dejaba que la pantalla mandara un id inventado y resolvía mirando el
`tipoContable` del cuerpo. Andaba, y era **una regla oculta**: la pantalla tenía
que saber que un default se pide con un número que no existe. Ese es exactamente
el conocimiento que la UI no tiene por qué tener.

Ahora cada medio viaja con una `claveEdicion` que el GET arma y la pantalla
devuelve tal cual. Para un medio materializado es su id; para un default es
`defecto:` más el tipo del que salió, que es lo único estable que tiene antes de
existir. La pantalla no la construye, no la interpreta y no la parsea.

Va con prefijo y no como valor centinela —0, -1, "nuevo"— porque **un centinela
es un número mágico que alguien tiene que recordar, y un prefijo se lee**.

Dos detalles que se decidieron explícitamente: resolver un id **no** materializa
nada, porque escribir cuatro filas como efecto de una búsqueda que va a fallar
deja rastro de algo que no pasó; y una clave de default sobre un local que ya
tiene configuración se contesta con "no existe" en vez de adivinar por tipo,
porque dos medios pueden compartir tipo —uno activo y otro no— y se editaría el
que no era.

## Un solo "Guardar", una sola transacción

La pantalla de un medio edita el nombre, la visibilidad, el orden, el tipo, el
procesador, la comisión **y el recargo** en la misma superficie, con un botón. Si
mandara dos requests, uno podría entrar y el otro fallar, y el local quedaría con
el medio renombrado y el recargo viejo sin que nadie se entere.

Entonces la ruta del medio es la **fachada** de los dos: acepta `recargoPct` y
escribe las dos cosas en la misma transacción. Lo que no hace es copiar el número:
hace el mismo upsert sobre `RecargoPagoLocal` que hace `PUT /api/recargos-pago`,
con la misma validación y la misma autoría, escrito una sola vez.

Hay una consecuencia de no duplicar la fuente que se resolvió explícitamente
porque no se puede evitar: **el recargo es del tipo contable, no del botón.**
`RecargoPagoLocal` está indexado por `(localId, medio)`. Si un medio cambia de
tipo, el recargo no viaja con él; lo que llega se escribe sobre el tipo con el que
el medio queda, y el del tipo anterior no se toca porque no es de este medio. Dos
medios del mismo tipo comparten un solo recargo.

Por eso el GET devuelve además `recargosPorTipo`: sin ese mapa, una pantalla que
cambia el tipo en el formulario y guarda escribiría sobre el tipo nuevo el
porcentaje que se había cargado para el viejo.

## La comisión se hereda, y "heredada" es un dato

`comisionPct` en `MedioCobroLocal` es NULL por defecto y **NULL significa hereda
del grupo**. Un número significa que alguien lo decidió para este local.

Por eso tampoco se hizo backfill de comisiones desde `ConfiguracionGrupo`:
copiarlas habría convertido "hereda" en "alguien lo decidió", y el día que cambie
la comisión contratada del grupo, ningún local la seguiría y nadie sabría por
qué. Está probado en la base: se mueve la comisión del grupo y el que hereda se
mueve, el que tiene override no.

El origen viaja con el número —`comisionOrigen`, `comisionHeredada`— para que la
pantalla pueda decir "7 % heredado del grupo" en vez de "7 %", que se lee como
una decisión.

## El recargo NO se copió acá

El recargo comercial —lo que se le suma al cliente— sigue siendo de
`RecargoPagoLocal`, que ya existía, ya está probado y ya tiene su unicidad por
`(local, medio)`. Copiarlo a `MedioCobroLocal` habría dado una sola tabla y **dos
fuentes autoritativas para el mismo número**. Dos columnas que dicen lo mismo no
se contradicen el día que se escriben: se contradicen el día que una se actualiza
sola.

Se componen en `componerMedios` y la pantalla ve un objeto. Hay un candado que lo
sostiene desde la base: se verifica contra `information_schema` que
`MedioCobroLocal` no tenga **ninguna** columna que se llame parecido a recargo,
así que agregar una segunda fuente pone algo en rojo.

Recargo y comisión siguen siendo cosas distintas por la razón de siempre: el
recargo lo paga el cliente y sube el total; la comisión la paga el comercio y baja
el neto.

## FIADO no es un medio de cobro

No entra plata: es una promesa de pago. Es tender único por regla del sistema, no
admite recargo ni comisión de procesador, y el POS ya lo dibuja aparte —fuera de
las ventas con servicios y exigiendo cliente—.

**No está en la lista y no se configura.** Uniformarlo habría sido prolijidad de
formulario a cambio de romper reglas que hoy funcionan. `TIPOS_COBRABLES` se
deriva de `MEDIOS_PAGO` menos FIADO —no se escribe a mano— para que el día que se
agregue un medio al enum no haya dos listas que se separan; y la API lo rechaza
explícitamente, diciendo por qué.

## El tipo contable y el procesador tampoco se fusionaron

Son dos preguntas distintas: `DEBITO` es **qué es** contablemente, `MERCADOPAGO`
es **por dónde pasó**. Un débito puede pasar por el banco o por Mercado Pago y
sigue siendo un débito para el cierre de caja. Fusionarlos habría obligado a
inventar tipos como `MP_DEBITO` que ninguna venta histórica tiene.

Por eso "MP Débito" hereda la comisión de DEBITO y no la de Mercado Pago: la
comisión se contrata por tipo, no por procesador. Está probado.

## Dónde quedó cada cosa

- `prisma/schema.prisma` — enum `ProcesadorCobro`, modelo `MedioCobroLocal`
- `prisma/migrations/20260905010000_medios_cobro_configurables/` — aditiva
- `lib/pos-ventas/mediosCobro.js` — todo lo que decide algo, puro y con candados
- `lib/pos-ventas/mediosCobroServidor.js` — lo único que habla con la base
- `app/api/medios-cobro/` — leer con `pos.usar`, escribir con
  `config_local.medios_cobro`
- `components/pos-ventas/FormaPago.jsx` — los botones salen de la configuración
- `scripts/pruebas-db/mediosCobro.mjs` — 96 afirmaciones contra Postgres

## Lo que queda pendiente

Las tres pantallas de Configuración POS, que están diseñadas en Figma y no se
improvisaron. Y la integración real de Mercado Pago: `integracionJson` está en la
tabla y hoy no lo lee nadie — no hay OAuth, ni webhooks, ni conciliación.
