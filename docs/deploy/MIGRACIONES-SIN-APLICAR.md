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

**Ninguna.** Producción está al día: 98 migraciones en el árbol y 98 aplicadas,
comprobado con `prisma migrate status` el 2026-08-20 después de desplegar
`963c9b3ef4a92d510ed78892dead3b9a980e33b0`.

No hay ningún corte esperando: `origin/main` y lo desplegado coinciden.

Los despliegues del 2026-08-19 y el de la madrugada del 20 —`b6cc9db`,
`289a036`, `9f425b0`, `94428ca` y `73e80d7`— fueron de solo código: el
clasificador informó cero archivos en todos los rangos y el contenedor
descartable contó las mismas 98 que el árbol, que es lo que distingue "no había
nada que aplicar" de "la imagen no conoce la migración".
