# Medicamentos veterinarios por voz

## Objetivo

Permitir que el supervisor cargue stock sanitario con comandos de voz y que el operador consulte, antes de una tarea, si hay medicamento/vacuna disponible, no vencido y con lote identificable.

## Atributos mínimos del medicamento

Cada insumo sanitario debe tener una ficha maestra y lotes físicos separados:

### Ficha maestra (`supplies`)

- `type`: `VACCINE`, `DEWORMER`, `MEDICINE`, `FEED` u `OTHER`.
- `name`: nombre comercial o nombre operativo usado por voz, por ejemplo `Vacuna aftosa`.
- `activeIngredient`: principio activo cuando aplica, por ejemplo `ivermectina`.
- `presentation`: presentación comercial, por ejemplo `caja x 12 frascos`.
- `unit`: unidad de consumo/stock, por ejemplo `dosis`, `ml`, `frascos` o `cajas`.
- `defaultDose`: dosis sugerida para prellenar eventos sanitarios.
- `withdrawalPeriodDays`: período de retiro cuando corresponda.
- `storageNotes`: conservación, cadena de frío o enfermedad objetivo.
- `status`: activo/inactivo.

### Lote físico (`supply_batches`)

- `batchNumber`: lote del laboratorio o lote generado por voz si no se informa.
- `quantityInitial` y `quantityAvailable`: stock inicial y disponible.
- `unit`: unidad real del lote.
- `expirationDate`: vencimiento obligatorio.
- `purchaseDate`, `supplier`, `invoiceNumber` y `location`: trazabilidad de compra y ubicación.
- `status`: disponible, bajo stock, vencido, consumido o descartado.

### Movimiento (`supply_movements`)

Todo ingreso, egreso, descarte, reserva o ajuste queda auditado con cantidad, motivo, fecha y relación opcional a evento sanitario.

## Comandos de voz soportados

### Ingreso de stock

Ejemplo:

> Ingresa al stock 10 cajas de ivermectina con fecha de vencimiento 2027-08-31 lote IV-77

El parser devuelve la intención `SUPPLY_STOCK_IN`, detecta cantidad, unidad, medicamento, tipo sanitario, lote y vencimiento. Al confirmar, se crea la ficha maestra si no existía, se crea el lote y se registra un movimiento `IN`.

### Validación previa de vacunación/tratamiento

Ejemplo:

> Vamos a vacunar contra la aftosa el Potrero 3

El parser devuelve la intención `HEALTH_SUPPLY_CHECK`, identifica el potrero y busca stock sanitario de tipo vacuna asociado a `aftosa`. La API permite consultar `/supplies/availability` para listar lotes disponibles no vencidos, ordenados por vencimiento.

## Flujo operativo recomendado

1. El supervisor carga stock por voz apenas entra mercadería.
2. El sistema exige vencimiento para que el lote sea utilizable.
3. Cuando el operador dice que va a vacunar/desparasitar/tratar, se consulta disponibilidad antes de confirmar la tarea.
4. La pantalla debe mostrar primero los lotes que vencen antes para aplicar criterio FEFO.
5. Si no hay stock o está vencido, el sistema bloquea la confirmación operativa y recomienda compra, traslado o descarte.
6. Al registrar el evento sanitario con lote y cantidad usada, se descuenta el stock con un movimiento `OUT`.
