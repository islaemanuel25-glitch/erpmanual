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

### `20260820060000_transferencia_cancelada_auditable` — commit `22e48cd8`, SIN EMPUJAR

Agrega tres columnas nullable a `Transferencia` —`canceladaEn`, `canceladaPorId`,
`motivoCancelacion`—. Sin índice nuevo: el que ya existe sobre `estado` alcanza.

**Qué dijo el clasificador:** `aditiva`, sin coincidencias. Corrido con `--vps`
el 2026-08-20 sobre el rango `6398efb..HEAD`.

**Compatible hacia atrás durante la ventana entre migrar y recrear:** el código
que está atendiendo no mira esas columnas.

**El quinto chequeo del backup NO aplica:** no borra ni transforma ningún dato.

**Hay una transferencia ya cancelada —la #97— y se queda en null a propósito.**
No se inventa un autor ni un motivo que nadie escribió: un null ahí significa "se
canceló antes de que esto se registrara", que es la verdad.

**Después de migrar y ANTES de recrear** hay que ejercer contra Postgres el
`select` y el `update` de `/api/transferencias/cancelar` con los campos nuevos.
No se pudo hacer al escribirla porque las columnas todavía no existían.

Cuando esto se despliegue, esta entrada se borra en el mismo commit que lo
confirma.

---

Antes de ésta, producción estaba al día: 99 migraciones en el árbol y 99 aplicadas,
comprobado con `prisma migrate status` el 2026-08-20 después de desplegar
`e7c03c70f34e2c9518d9cc1eeb735d6009b8f4fb`.

La última fue `20260820020000_venta_anulada` —las tres columnas de anulación de
`Venta` más su índice—, y **se aplicó de verdad**: `migrate deploy` imprimió
"Applying migration" y el contenedor descartable contó 99, el mismo número que el
árbol. Eso es lo que distingue "se aplicó" de "la imagen no la conocía", que
salen iguales en el código de salida.

El paso que quedaba anotado —ejercer contra Postgres el `select` de la ruta de
anular con los campos nuevos— se corrió **entre migrar y recrear**, que es la
única ventana en la que se puede: el select completo, el filtro comercial con la
columna nueva y el `update` de anulación dentro de una transacción revertida a
propósito. Los tres con los argumentos validados y sin escribir nada.

Los despliegues del 2026-08-19 y el de la madrugada del 20 —`b6cc9db`,
`289a036`, `9f425b0`, `94428ca` y `73e80d7`— fueron de solo código: el
clasificador informó cero archivos en todos los rangos y el contenedor
descartable contó las mismas 98 que el árbol, que es lo que distingue "no había
nada que aplicar" de "la imagen no conoce la migración".
