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
