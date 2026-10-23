## Última actualización del Proyecto Claude

**Fecha:** 2026-10-23 02:05

## Módulos modificados recientemente

### pos-transferencias
- fix(deposito): lo que pidió el local se resalta igual que lo enviado en la recepción, feat(deposito): preparar un pedido de local en el celular, como se recibe, feat(deposito): Pedidos de locales, la entrada del depósito en el celular
- Archivos: 9 nuevos, 10 modificados (19 total)

### transferencias
- fix(deposito): lo que pidió el local se resalta igual que lo enviado en la recepción, feat(deposito): preparar un pedido de local en el celular, como se recibe, feat(deposito): cada línea de un pedido guarda cuándo la decidió el depósito
- Archivos: 4 nuevos, 6 modificados (10 total)

### stock
- fix: tarjeta de stock — "Sin mín/máx", o solo el límite que existe, en vez de "mín Sin ajustar · máx Sin ajustar" (pantalla SIN VERIFICAR en navegador), fix: control de stock — el recuadro de la revisión carga siempre y los errores del listado dicen su motivo (causa en producción SIN CONFIRMAR; pantalla SIN VERIFICAR en navegador), fix: control de stock — cada conteo corrige el stock al aceptarlo, contra el stock vivo, y la reconstrucción de los conteos ya hechos (pantalla SIN VERIFICAR en navegador)
- Archivos: 11 modificados (11 total)

### auditoria
- feat(pedidos): sumar al pedido enviado con confirmación, todos los cambios juntos (pantalla SIN VERIFICAR en el celular), feat(pedidos): sumar al pedido enviado hasta que el depósito lo empieza
- Archivos: 1 modificados (1 total)

### productos
- feat(pedidos): la foto del producto a la izquierda de cada tarjeta, con la inicial si no hay (pantalla SIN VERIFICAR en navegador)
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- app/modulos/pos-transferencias/cantidadPedidaDestacada.test.mjs
- app/modulos/pos-transferencias/prepararPedido.test.mjs
- components/pos-transferencias/PrepararPedidoCelular.jsx
- app/modulos/pos-transferencias/deposito.fixture.json
- app/modulos/pos-transferencias/entradaDeposito.test.mjs
- app/modulos/pos-transferencias/entradaEscritorioAntes.fixture.json
- app/modulos/pos-transferencias/entradaEscritorioIgual.test.mjs
- components/pos-transferencias/EntradaDepositoCelular.jsx
- components/pos-transferencias/TransferenciaSinPedido.jsx
- components/transferencias/fichaRecepcionAntes.fixture.json
- components/transferencias/fichaRecepcionIgual.test.mjs
- components/transferencias/tarjetaRecepcionAntes.fixture.json
- components/transferencias/tarjetaRecepcionIgual.test.mjs

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
