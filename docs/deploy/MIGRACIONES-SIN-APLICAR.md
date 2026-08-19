# Migraciones que están en `main` y NO en producción

**Este archivo se lee en el paso 0 de `/deploy`, antes del backup.** Existe para
que el próximo despliegue sepa que trae migraciones **antes de arrancar**, y no
lo descubra a mitad de camino cuando el clasificador le informe un rango que ya
no es de cero.

Es una lista viva, no un histórico: **cuando una migración se aplica en
producción, se borra de acá** en el mismo commit que confirma el despliegue. Un
archivo que acumula filas viejas deja de decir qué falta y pasa a ser otra cosa
que hay que interpretar.

Si la lista está vacía, el despliegue es solo de código.

---

## Pendientes

### `20260818120000_tarjeta_producto_por_local`

**Qué hace:** agrega dos columnas a `ConfiguracionLocal`,
`tarjetaPrecioUnitario` y `tarjetaOcultarEquivalencia`, las dos `BOOLEAN` y
nullable. Nada más: dos `ALTER TABLE ADD COLUMN`, sin backfill, sin índices, sin
tocar una fila existente.

**Llegó en:** `7eda391` — *feat(tarjeta): dos ajustes por local para cómo se ve
el precio en el catálogo*. La migración en sí venía del commit anterior,
`5a62a65`. En `main` desde el 2026-08-18.

**Qué dice el clasificador:** `aditiva`, sin coincidencias con la lista de
palabras peligrosas. Verificado corriendo
`node scripts/clasificar-migraciones.mjs --desde 1d01286`. Eso **no es una
autorización** —el análisis es textual y el propio script lo aclara—, pero sí
confirma que no hay `DROP`, ni `NOT NULL` sobre una tabla con datos, ni un
`CREATE UNIQUE INDEX` que pueda chocar.

**La ventana entre migrar y recrear es segura.** Durante esos segundos el
esquema es nuevo y el código viejo: acá eso no molesta porque el código viejo no
mira estas dos columnas. No hay orden inverso posible que rompa.

**El quinto chequeo del backup NO aplica.** El skill `/backup` pide comprobar
que un valor de los que se van a perder esté dentro del dump cuando el
despliegue trae una migración de DATOS. Ésta no borra ni transforma nada, así
que alcanza con los cuatro chequeos de siempre. Los cuatro siguen siendo
obligatorios.

**Qué se ve después de aplicarla:** nada. Las dos preferencias nacen apagadas
—`null` significa apagado— y un local que no entre a la pantalla de apariencia
ve exactamente lo mismo que hoy. Está medido: la tarjeta sigue midiendo 215,9 px
y entran 3 enteras a 390. Por eso esta tanda quedó empujada y sin desplegar: no
justificaba un corte propio.

**Nada especial que hacer.** El paso 4 del procedimiento la aplica como
cualquier otra, con el contenedor descartable de la imagen nueva. Lo único que
cambia respecto de un despliegue de solo código es que el conteo de migraciones
que informe ese contenedor tiene que subir en uno, y eso hay que comprobarlo:
está en la regla dura 7.

---

## Con qué más viaja, al 2026-08-18

Tres tandas quedaron empujadas y sin desplegar, a propósito y en este orden. Se
anota acá porque quien dispare el despliegue tiene que saber **todo** lo que sale
en ese corte, no solo la migración.

Producción está en `1d012861aec08554da879dcc421ce007ab7bd50c`. Lo que entra son
seis commits, de `5a62a65` a `978f790`.

1. **Los dos ajustes de la tarjeta por local** (`5a62a65` + `7eda391`) — es la
   tanda de esta migración. Los dos interruptores nacen APAGADOS, así que el día
   que se despliegue **producción se ve exactamente igual que hoy** hasta que
   alguien entre a la pantalla de apariencia y los prenda.
2. **El porcentaje de ganancia en la tarjeta** (`978f790`) — esto SÍ se ve solo,
   sin que nadie configure nada: aparece "30 %" al lado del precio, y "falta %"
   en ámbar en las filas sin porcentaje asignado. Medido sobre la copia con datos
   reales: **1.677 de 10.521 filas**, el 15,9 %, van a mostrar "falta %".
   Es el cambio visible del corte, y conviene que Emanuel lo sepa antes y no lo
   descubra en el mostrador.
3. **Dos de documentación y uno de herramienta** (`ee4d3b0`, `fdce78b`,
   `5fd3e82`) — no tocan nada de lo que corre.

Estado de los chequeos previos al 2026-08-18, todos corridos:

- `origin/main` y el HEAD local coinciden, cero commits sin empujar.
- Suite 3.511 en verde contra el commit, con un `todo` conocido.
- `npm run build` limpio.
- Trinquete de hardcodeo sin cambios.
- Las 15 huellas a 1366 idénticas a la línea de base.
- Sonda de cascada VERDE — las utilidades le siguen ganando al kit.
- Clasificador: una sola migración en el rango, `aditiva`, sin coincidencias.

**Lo que falta es lo que solo se hace desplegando**: el backup validado del paso
1, la referencia de rollback del paso 2, y esperar a que Actions publique la
imagen. Nada de eso se adelantó.
