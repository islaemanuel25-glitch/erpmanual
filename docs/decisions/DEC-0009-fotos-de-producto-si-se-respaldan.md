# DEC-0009 — Las fotos de PRODUCTO no vencen y SÍ se respaldan

**Estado:** Vigente

**Fecha:** 2026-08-22

## Por qué esta decisión existe y no alcanzaba con DEC-0008

`DEC-0008` dice que las imágenes de comprobantes viven siete días y **no** entran
al backup, y cierra con una frase deliberada:

> Está escrito acá … para que nadie "arregle" el backup agregándole el volumen
> sin entender por qué no estaba.

Esta decisión no toca esa. **Es otro volumen, con el ciclo de vida opuesto**, y se
escribe para que la próxima persona que lea las dos no crea que la primera quedó
sin efecto.

## La decisión

**Las fotos de producto no vencen nunca, y el volumen entra a la cadena de
backup.**

- Volumen propio: `erpazul_fotos_productos`, con su centinela
  `.volumen-fotos-productos`.
- **Ninguna rutina de retención sobre el contenido.** Una foto se borra cuando
  alguien decide borrarla, no por el paso del tiempo.
- El backup diario del VPS empaqueta el volumen, lo verifica y lo rota como
  copias, con las mismas series que la base.

## El motivo, que es el contraste exacto con DEC-0008

Aquello que se decidió no respaldar eran **copias de papeles que se tiran a la
semana**, y lo que importaba de ellas —número, fecha, líneas, importes— queda en
la base, que sí se respalda. Se perdía la imagen, no la información.

Acá la foto **es** la información. No hay ninguna otra fila que la reconstruya:
si se pierde el volumen, hay que sacar todas las fotos de nuevo, una por una,
producto por producto. Es trabajo humano irrecuperable, no un archivo que se
puede volver a generar.

## Lo que se aceptó, y conviene tenerlo escrito

**El paquete de fotos NO va al repo git cifrado.** Ahí van el semanal y el
mensual de la base porque pesan unos 2,7 MB. El paquete de fotos crece con el
catálogo —a 300 KB por foto, dos mil productos son unos 600 MB— y git guarda
todas las versiones para siempre: meterlo ahí haría crecer el repo sin techo y
sin poder deshacerlo.

Así que el paquete tiene **una copia menos que la base**: va a la notebook y al
disco externo, no al repo remoto. La consecuencia está aceptada: si se pierden el
VPS y la notebook al mismo tiempo, y el disco externo no estaba conectado, las
fotos se pierden aunque la base se recupere.

**Y retiene menos copias**: 14 diarias contra 30, 8 semanales contra 12. Lo que
hace que eso alcance es que las fotos no cambian —el nombre lleva un azar
adentro, ninguna se pisa— así que cuando el volumen no cambió, el paquete del día
es un enlace duro al anterior y no ocupa nada.

## Lo que todavía no está probado

La restauración está **escrita y no ejercida**: el volumen no existe en
producción todavía, así que no hay ningún paquete real contra el cual probarla.
El procedimiento y el criterio para darla por buena están en
`docs/RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md`.

Decirlo así importa: un procedimiento escrito y uno probado no son lo mismo, y la
diferencia se nota el día que hace falta. Es la misma distinción que ya está
anotada para el rollback de migraciones.
