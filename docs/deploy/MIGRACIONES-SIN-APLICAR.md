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

### `20260820020000_venta_anulada` — commit `e7d9ff40`, SIN EMPUJAR

Agrega tres columnas nullable a `Venta` —`anuladaEn`, `anuladaPorId`,
`motivoAnulacion`— y un índice sobre `anuladaEn`.

**Qué dijo el clasificador:** `aditiva`, sin coincidencias. Corrido con `--vps`
el 2026-08-20 sobre el rango `963c9b3..HEAD`.

**Compatible hacia atrás durante la ventana entre migrar y recrear:** el código
que está atendiendo no mira esas columnas, así que sigue funcionando igual
mientras existan y estén vacías.

**El quinto chequeo del backup NO aplica:** no borra ni transforma ningún dato.
Las tres columnas nacen en null, que es el estado real de las ventas que ya
existen —ninguna está anulada—, y por eso tampoco lleva backfill.

**Después de migrar y ANTES de recrear** hay que ejercer contra Postgres el
`select` de `/api/pos-ventas/venta/[id]/anular` con los campos nuevos. No se pudo
hacer al escribirla porque las columnas todavía no existían, y es la clase de
error que ni el build ni los candados ven.

Cuando esto se despliegue, esta entrada se borra en el mismo commit que lo
confirma.

---

Antes de esta, producción estaba al día: 98 migraciones en el árbol y 98
aplicadas, comprobado con `prisma migrate status` el 2026-08-20 después de
desplegar `963c9b3ef4a92d510ed78892dead3b9a980e33b0`. Con ésta el árbol pasa a
99.

Los despliegues del 2026-08-19 y el de la madrugada del 20 —`b6cc9db`,
`289a036`, `9f425b0`, `94428ca` y `73e80d7`— fueron de solo código: el
clasificador informó cero archivos en todos los rangos y el contenedor
descartable contó las mismas 98 que el árbol, que es lo que distingue "no había
nada que aplicar" de "la imagen no conoce la migración".
