# Sistema de Administración de Venta de Solares y Gestión de Cobros

**Documento de Especificación Funcional — Versión 6.6 (Versión 1.0 Producción, CONGELADA — base oficial para diseño técnico)**

---

## Índice

1. Nombre del sistema
2. Descripción general
3. Objetivo del sistema
4. Alcance de la Versión 1.0 (Producción)
5. Usuarios del sistema y matriz de permisos
6. Módulos del sistema
7. Flujo general del proceso
8. Casos de uso principales
9. Reglas de negocio
10. Validaciones del sistema
11. Estados de las entidades
12. Requerimientos funcionales
13. Requerimientos no funcionales
14. Modelo de datos preliminar
15. Cálculo del balance del contrato, de cada cuota y de cada mora
16. Pantallas principales
17. Ejemplos de proceso
18. Extensiones futuras (fuera del alcance de la v1.0)
19. Beneficios del sistema
20. Conclusión
21. Próximos entregables técnicos

---

## 1. Nombre del sistema

**Sistema de Administración de Venta de Solares y Gestión de Cobros**

## 2. Descripción general

El sistema tiene como objetivo administrar de manera eficiente el proceso de venta de solares, permitiendo registrar solares disponibles, clientes interesados, contratos de venta, planes de pago, cuotas, cobros realizados, balances pendientes y reportes financieros.

## 3. Objetivo del sistema

Centralizar y automatizar la gestión de ventas de solares y los cobros asociados, permitiendo a la empresa llevar un control claro, ordenado y confiable de sus operaciones.

### Objetivos específicos

* Registrar y administrar solares disponibles, bloqueados por venta pendiente, vendidos o reservados.
* Gestionar la información de los clientes.
* Registrar ventas de solares mediante contratos, generados junto con un plan de pago preliminar desde el inicio.
* Crear planes de pago personalizados, con capital e interés claramente diferenciados.
* Controlar cuotas y moras vencidas, parciales, pagadas y pendientes.
* Registrar pagos realizados por los clientes, incluyendo el pago inicial como cobro formal ligado al contrato.
* Distinguir claramente entre adelantos, abonos a capital, cuotas y mora.
* Aplicar una regla de mora predecible: un cargo que se genera una vez y queda fijo, salvo ajuste formal.
* Mantener el estado operativo del contrato independiente de su historial de renegociaciones.
* Consultar balances actualizados y siempre consistentes entre contrato, cuotas y moras.
* Generar reportes de ventas, cobros y deudas.

## 4. Alcance de la Versión 1.0 (Producción)

Versión 1.0 completa y lista para producción, construida internamente por etapas técnicas pero liberada como un producto integral.

### 4.1 Incluido en la Versión 1.0

* Seguridad completa: usuarios, roles, permisos configurables y auditoría.
* Gestión de clientes, proyectos y solares, con reservas y su historial.
* Registro de ventas: bloquea el solar de inmediato, genera el contrato ("Pendiente de inicial") y el plan de pago preliminar; el solar solo pasa a "Vendido" cuando el contrato se activa con el cobro del inicial.
* Plan de pago con desglose de capital e interés por cuota.
* Registro de cobros: Inicial, Cuota, Mora, Adelanto y Abono a capital, cada uno con su tratamiento propio.
* Cálculo de mora como cargo único generado al superar el período de gracia, con soporte de pagos parciales sobre ese cargo fijo.
* Renegociación de contratos, obligatoria para todo abono a capital, reflejada como etiqueta derivada, no como estado operativo del contrato.
* Cálculo de comisiones e impuestos, parametrizables desde configuración general.
* Consulta de estado de cuenta y balance, calculados dinámicamente y siempre consistentes entre contrato, cuotas y moras.
* Reportes administrativos y financieros.
* Control de concurrencia, manejo de anulaciones y validaciones de integridad.
* Bitácora de auditoría sobre todas las tablas financieras y de configuración.
* Preparación para respaldo y despliegue en producción.

### 4.2 Etapas técnicas de construcción

| Etapa | Contenido |
|---|---|
| 1 | Base de datos, seguridad, usuarios, roles, permisos y auditoría |
| 2 | Clientes, proyectos, solares y reservas |
| 3 | Ventas (bloqueo de solar), contrato "Pendiente de inicial", plan de pago preliminar, cobro del inicial, activación y paso del solar a "Vendido" |
| 4 | Cobros, recibos, adelantos y abonos a capital (con disparo de renegociación) |
| 5 | Mora (cargo fijo con pagos parciales), cuotas vencidas, estados de cuenta y balances |
| 6 | Renegociaciones (historial derivado), recálculo de plan de pago, anulaciones y control de cambios |
| 7 | Comisiones, configuración general e impuestos |
| 8 | Reportes administrativos y financieros |
| 9 | Pruebas, hardening, backup, despliegue y documentación |

### 4.3 Fuera del alcance de la Versión 1.0

* Pasarela de pago en línea para el cliente.
* Firma electrónica de contratos.
* Integración con sistemas contables externos.
* Notificaciones automáticas por correo o WhatsApp.
* Gestión documental de contratos.
* Manejo de múltiples monedas simultáneas.
* Tabla independiente de `Impuestos` para más de un tipo de impuesto.

## 5. Usuarios del sistema y matriz de permisos

### 5.1 Roles definidos

* **Administrador:** acceso completo al sistema.
* **Vendedor:** gestión de clientes, solares y ventas dentro de sus permisos.
* **Cajero / Encargado de cobros:** registro de pagos y consulta de balances.
* **Supervisor / Gerente:** consulta de reportes y supervisión general.

### 5.2 Matriz de permisos por función

| Función | Administrador | Vendedor | Cajero | Gerente |
|---|---|---|---|---|
| Crear usuario | Sí | No | No | No |
| Crear cliente | Sí | Sí | No | Sí |
| Editar cliente | Sí | Sí | No | Sí |
| Registrar proyecto | Sí | No | No | No |
| Registrar solar | Sí | No | No | No |
| Reservar solar | Sí | Sí | No | Sí |
| Registrar venta (bloquea solar, crea contrato + plan preliminar) | Sí | Sí | No | Sí |
| Registrar cobro del inicial (activa contrato, plan y marca solar Vendido) | Sí | No | Sí | Sí |
| Registrar adelanto | Sí | No | Sí | Sí |
| Registrar pago de mora (total o parcial) | Sí | No | Sí | Sí |
| Registrar abono a capital | Sí | No | No | Sí |
| Anular venta (libera el solar) | Sí | No | No | Sí |
| Renegociar contrato | Sí | No | No | Sí |
| Anular recibo | Sí | No | No | Sí |
| Ajustar/anular una mora ya generada | Sí | No | No | Sí |
| Marcar comisión como pagada | Sí | No | No | Sí |
| Consultar estado de cuenta | Sí | Sí | Sí | Sí |
| Ver reportes de ventas | Sí | Limitado (propios) | No | Sí |
| Ver reportes de cobros | Sí | No | Limitado (propios) | Sí |
| Ver reporte de mora | Sí | No | Limitado | Sí |
| Ver reporte de comisiones | Sí | Limitado (propias) | No | Sí |
| Configurar impuestos, mora, moneda y parámetros | Sí | No | No | No |
| Consultar auditoría | Sí | No | No | Sí (solo lectura) |

## 6. Módulos del sistema

### 6.1 Módulo de Seguridad y Usuarios

**Funciones:** crear, modificar, activar/desactivar usuarios; asignar roles y permisos; cambiar contraseñas; registrar auditoría.

**Datos:** nombre de usuario, correo, nombre de acceso, contraseña (cifrada), rol, estado, fecha de creación.

### 6.2 Módulo de Clientes

**Funciones:** registrar, editar, consultar historial, ver solares adquiridos, ver balances, consultar estado de cuenta.

**Datos:** código, nombre completo, cédula o RNC, teléfono, correo, dirección, fecha de nacimiento, estado civil, ocupación, referencias personales, estado, datos de auditoría.

### 6.3 Módulo de Proyectos o Urbanizaciones

**Funciones:** registrar, editar, activar/inactivar, consultar solares por proyecto.

**Datos:** código, nombre, ubicación, descripción, cantidad total de solares, estado, datos de auditoría.

### 6.4 Módulo de Solares

**Funciones:** registrar, editar, consultar disponibilidad, cambiar estado, asociar a proyecto.

**Datos:** código, proyecto, manzana, número de solar, metros cuadrados, precio por metro, precio total, estado, ubicación, observaciones, datos de auditoría.

**Estados:** Disponible · Reservado · Bloqueado · Vendido · Anulado.

**Regla de unicidad:** la combinación proyecto + manzana + número de solar no puede repetirse.

**Campo `tipo_bloqueo` (definido en esta versión):** dado que el estado "Bloqueado" puede originarse por dos motivos distintos, se agrega un campo formal —no texto libre— para distinguirlos:

* `Venta pendiente de inicial` — asignado automáticamente por el sistema al registrar una venta; se libera automáticamente (el solar vuelve a Disponible/Reservado) si la venta se anula o cancela antes del cobro del inicial.
* `Administrativo` — asignado manualmente por un Administrador (ej. solar retirado temporalmente de venta); **no se libera automáticamente** por ningún proceso del sistema, solo por acción manual de un usuario autorizado.
* `Legal` — asignado manualmente (ej. disputa o proceso legal en curso); tampoco se libera automáticamente.
* `Otro` — casos no cubiertos por las categorías anteriores; requiere descripción en `observaciones`.

Solo un bloqueo con `tipo_bloqueo = Venta pendiente de inicial` participa en las reglas automáticas de esta especificación (bloqueo al vender, liberación al anular antes del inicial). Los demás tipos quedan fuera del flujo automático y solo cambian por acción manual.

**Relación entre el estado del contrato y el estado del solar (definida en esta versión):**

| Momento | Estado del contrato | Estado del solar |
|---|---|---|
| Antes de la venta | — | Disponible (o Reservado, si tenía reserva activa) |
| Venta registrada, inicial pendiente | Pendiente de inicial | **Bloqueado** |
| Inicial pagado | Activo | **Vendido** |
| Venta anulada o inicial nunca pagado (venta cancelada) | Anulado / Cancelado | Disponible |

`Bloqueado` en este contexto significa específicamente "venta registrada, a la espera del cobro del inicial" cuando `tipo_bloqueo = Venta pendiente de inicial` — distinto de un bloqueo administrativo manual, identificado por los demás valores de `tipo_bloqueo`.

### 6.5 Módulo de Reservas

**Funciones:** crear reserva sobre un solar disponible, asociarla a un cliente y vendedor, expirar automáticamente al vencer el plazo configurado, cancelar manualmente, convertir en venta.

**Datos:** solar, cliente, vendedor, fecha de reserva, fecha de expiración, estado, datos de auditoría.

**Estados:** Activa · Expirada · Cancelada · Convertida en venta.

*Al convertirse en venta, el solar pasa de "Reservado" a "Bloqueado" (no directamente a "Vendido") — sigue la misma regla que una venta directa.*

### 6.6 Módulo de Ventas

**Funciones:** crear venta, seleccionar cliente y solar (o convertir una reserva activa), definir precio/inicial/financiamiento, definir cuotas, frecuencia de pago y fecha de primer pago, generar el contrato y el plan de pago preliminar, bloquear el solar, activar la venta al cobrarse el inicial (marcando el solar como vendido), consultar y anular ventas según permisos.

**Secuencia formal venta → solar bloqueado → contrato → plan → inicial → solar vendido:**

1. Se registra la venta.
2. El sistema **bloquea el solar** (`Solares.estado = Bloqueado`) — deja de estar disponible para otras ventas o reservas.
3. El sistema genera de inmediato el **contrato en estado "Pendiente de inicial"**.
4. El sistema genera, en el mismo momento, el **plan de pago (cuotas) en estado preliminar**.
5. Se registra el **cobro del inicial, siempre asociado a ese contrato**.
6. El contrato pasa automáticamente a **"Activo"**, el plan de pago queda habilitado, y **el solar pasa a "Vendido"**.

**Si la venta se anula o se cancela antes de cobrarse el inicial**, el solar regresa a "Disponible" (o a "Reservado" si existía una reserva activa que se restaura, según la política que defina la empresa).

**Sobre `monto_cuota`:** valor de referencia inicial únicamente; la fuente vigente de los montos de cuota es siempre la tabla `Cuotas`.

**Datos:** número de venta, cliente, solar, proyecto, fecha de venta, precio total, monto inicial, monto financiado, cantidad de cuotas, monto_cuota (referencial), frecuencia de pago, fecha de primer pago, vendedor, comisión, estado, datos de auditoría.

**Estados:** Activa · Saldada · Anulada · En mora · Cancelada.

### 6.7 Módulo de Contratos

**Funciones:** generar (siempre en estado "Pendiente de inicial", junto con su plan de pago preliminar y el bloqueo del solar), consultar, imprimir/descargar en PDF, activar tras el cobro del inicial (marcando el solar como vendido), registrar condiciones especiales, renegociar, calcular balance vigente (ver sección 15).

**Datos:** número de contrato, cliente, solar, precio de venta, inicial, monto financiado, plan de pago, fecha, condiciones de pago, firmas requeridas, estado, datos de auditoría.

**Estados operativos (formal, almacenado):** Pendiente de inicial · Activo · En mora · Saldado · Cancelado · Anulado.

**"Renegociado" es una etiqueta derivada**, no un estado operativo: se considera "Renegociado" cuando existe al menos un registro asociado en `Renegociaciones`, sin afectar el estado real del contrato ni del solar.

**Estados operativos que permiten registrar cobros de Cuota, Mora, Adelanto o Abono a capital:** `Activo` y `En mora`.

### 6.8 Módulo de Renegociación de Contratos

**Funciones:** registrar renegociación sobre un contrato en estado Activo o En mora; modificar cuotas restantes, monto o fechas; registrar traspaso de solar; recalcular el plan de pago; mantener historial de condiciones; ajustar formalmente una mora ya generada si el negocio lo autoriza.

**Regla de abonos a capital (Opción A, cerrada desde v6.2):**

* **Adelanto:** pago anticipado aplicado a una cuota futura específica (`id_cuota` obligatorio), sin modificar su monto original.
* **Abono a capital:** reduce la base financiera del contrato y obliga a una renegociación formal en la misma transacción, que recalcula el plan de pago.

**Datos:** identificador, contrato asociado, fecha, motivo, condiciones anteriores, condiciones nuevas, usuario que autoriza, id_cobro_origen, datos de auditoría.

### 6.9 Módulo de Plan de Pago

**Funciones:** generar cuotas automáticamente (en estado preliminar) junto con el contrato; habilitarlas para cobro al activarse el contrato; editar según permisos; consultar por estado; recalcular ante renegociación.

**Regla de habilitación:** las cuotas se crean junto con el contrato, pero solo aceptan cobros de tipo Cuota, Mora o Adelanto cuando el contrato está en estado `Activo` o `En mora`.

**Datos:** número de cuota, fecha de vencimiento, monto total, capital, interés, estado, datos de auditoría.

**Estados almacenados:** Pendiente · Pagada · Parcialmente pagada · Vencida · Anulada.

**Campos calculados, no almacenados:** `monto_pagado` y `balance_pendiente` se obtienen en tiempo real desde `Detalle_Cobro` (ver sección 15).

**Etiqueta derivada:** una cuota `Vencida` se muestra como **"En mora"** si existe un registro vigente en el módulo de Mora.

### 6.10 Módulo de Cobros

**Funciones:** registrar pagos —Inicial, Cuota, Mora (total o parcial), Adelanto o Abono a capital—; calcular balance; generar recibo; anular recibos con motivo obligatorio; consultar historial.

**Datos del cobro (encabezado):** número de recibo, cliente, contrato (siempre obligatorio, incluyendo el cobro del inicial), fecha de pago, monto total, método de pago, referencia del pago, modalidad de aplicación, usuario que registra, estado, fecha y usuario de anulación (si aplica), datos de auditoría.

**Datos del detalle de cobro:** cuota afectada (si aplica), mora afectada (si aplica), tipo de aplicación, monto aplicado.

**Regla de referencias por tipo de aplicación:**

| Tipo de aplicación | `id_cuota` | `id_mora` | Estado del contrato requerido | Efecto sobre el solar |
|---|---|---|---|---|
| Inicial | Nulo | Nulo | Pendiente de inicial | Activa el paso de Bloqueado → Vendido |
| Cuota | Obligatorio | Nulo | Activo o En mora | Ninguno |
| Adelanto | Obligatorio (cuota futura) | Nulo | Activo o En mora | Ninguno |
| Mora | Nulo | Obligatorio | Activo o En mora | Ninguno |
| Abono a capital | Nulo | Nulo | Activo o En mora; requiere renegociación | Ninguno |

**Métodos de pago:** Efectivo · Transferencia · Depósito · Cheque · Tarjeta · Otro.

### 6.11 Módulo de Mora

El sistema identificará automáticamente las cuotas vencidas y calculará mora únicamente cuando hayan transcurrido **5 días calendario** después de la fecha de vencimiento (período de gracia configurable desde `dias_gracia_mora`).

A partir del **sexto día**, el sistema **genera una única vez** el cargo de mora, calculado sobre el **balance pendiente de la cuota en ese momento**, usando el porcentaje configurado en Configuración General.

**Regla de congelamiento:**

> La mora se calcula **una sola vez** y **queda congelada como cargo generado** (`monto_mora` fijo). Pagos posteriores sobre el capital de la cuota no recalculan ni reducen la mora ya generada. Solo una anulación, un ajuste autorizado o una renegociación pueden modificar el `monto_mora` de un registro existente. `dias_atraso` sí puede seguir actualizándose para reporte.

**Fórmula de inicio de mora:**
```
fecha_inicio_mora = fecha_vencimiento + dias_gracia_mora + 1 día
```

**Fórmula de cálculo del monto de mora (una sola vez, al generarse):**
```
monto_mora = balance_pendiente_cuota_en_ese_momento × porcentaje_mora
```

*(`porcentaje_mora` se almacena y opera como fracción decimal: 2% = `0.02`.)*

**Pagos parciales de mora:**

```
monto_pagado_mora      = suma(Detalle_Cobro.monto_aplicado
                               donde id_mora = esta mora
                               y Cobro.estado = 'Registrado')

balance_pendiente_mora = Mora.monto_mora - monto_pagado_mora
```

**Regla de unicidad:** no puede existir más de un registro de mora con estado `Pendiente` o `Parcialmente pagada` para la misma cuota.

**Datos:** cliente, contrato, cuota vencida, fecha de inicio de mora, días de atraso, porcentaje de mora aplicado, balance base de cálculo (congelado), monto total en mora (congelado), estado, datos de auditoría.

**Estados:** Pendiente · Parcialmente pagada · Pagada · Anulada.

### 6.12 Módulo de Impuestos y Comisiones

**Funciones:** configurar impuesto aplicable sobre venta o cobro; definir comisión por vendedor; calcular el monto final de la comisión; marcar comisiones como pagadas; consultar comisiones pendientes y pagadas.

**Datos:** tipo de impuesto, porcentaje o monto, vendedor, venta asociada, monto de comisión calculado, fecha de generación, fecha de pago, usuario que marca como pagada, estado, datos de auditoría.

### 6.13 Módulo de Configuración General

**Datos:** clave, valor, descripción, estado, datos de auditoría.

**Convención de formato:** todo parámetro que represente un porcentaje se almacena como fracción decimal (2% → `0.02`).

**Parámetros iniciales sugeridos:**

| Clave | Valor de ejemplo | Notas |
|---|---|---|
| dias_reserva_default | 15 | |
| porcentaje_mora | 0.02 | Equivale a 2% |
| dias_gracia_mora | 5 | |
| impuesto_venta | 0 | Fracción decimal si aplica |
| formato_numero_recibo | REC-000001 | |
| moneda_default | DOP | |
| simbolo_moneda | RD$ | |
| requiere_inicial_pagado_para_activar_contrato | true | |
| comision_incluye_inicial | true | |

### 6.14 Módulo de Reportes

Reportes de: solares (disponibles, reservados, bloqueados por venta pendiente, vendidos), reservas próximas a vencer, ventas, cobros (inicial, adelantos y abonos a capital por separado), balances pendientes, cuotas vencidas y en mora, moras parcialmente pagadas, clientes en mora, contratos saldados, contratos pendientes de inicial, contratos renegociados (filtro derivado), comisiones, estado de cuenta por cliente, ingresos generales.

## 7. Flujo general del proceso

1. Registro de proyecto y solares.
2. Registro de cliente.
3. Reserva del solar (opcional) y/o venta directa.
4. Venta del solar: se registra la venta; el sistema **bloquea el solar**, genera el contrato ("Pendiente de inicial") y el plan de pago preliminar.
5. Se registra el cobro formal del inicial, asociado al contrato; el contrato pasa a "Activo", el plan de pago queda habilitado y **el solar pasa a "Vendido"**.
6. Registro de cobros conforme el cliente paga (cuota, mora total/parcial, o adelanto a una cuota futura específica), posible mientras el contrato esté Activo o En mora.
7. Si el cliente hace un abono a capital, el sistema exige formalizar una renegociación que recalcula el plan de pago (el contrato se marca como "Renegociado" solo como etiqueta derivada).
8. Si una cuota supera el período de gracia sin pagarse, el sistema genera una única vez su cargo de mora, congelado.
9. Consulta de balance en cualquier momento (calculado dinámicamente, ver sección 15).
10. Cierre o saldo del contrato al completar los pagos. Si la venta se anula antes del inicial, el solar regresa a "Disponible".

## 8. Casos de uso principales

| # | Caso de uso | Actor principal | Descripción breve |
|---|---|---|---|
| CU-01 | Registrar cliente | Vendedor / Administrador | Captura los datos del cliente interesado en comprar. |
| CU-02 | Registrar solar | Administrador | Da de alta un solar dentro de un proyecto existente. |
| CU-03 | Reservar solar | Vendedor | Crea un registro de reserva con fecha de expiración. |
| CU-04 | Vender solar | Vendedor | Bloquea el solar, genera contrato "Pendiente de inicial" y plan de pago preliminar. |
| CU-05 | Cobrar inicial | Cajero | Registra el cobro asociado al contrato; activa contrato y plan, y marca el solar como Vendido. |
| CU-06 | Generar plan de pago | Sistema (automático) | Calcula y crea las cuotas preliminares, con capital e interés. |
| CU-07 | Registrar cobro (cuota/mora/adelanto) | Cajero | Aplica un pago sin modificar el plan de pago, válido si el contrato está Activo o En mora. |
| CU-08 | Registrar abono a capital | Administrador / Gerente | Registra el cobro y dispara de inmediato una renegociación. |
| CU-09 | Consultar estado de cuenta | Cajero / Vendedor / Gerente | Calcula y muestra pagos, cuotas, mora (incluyendo parciales) y balance. |
| CU-10 | Anular recibo | Administrador / Gerente | Revierte un cobro registrado por error, con motivo obligatorio. |
| CU-11 | Renegociar contrato | Administrador / Gerente | Modifica las condiciones y recalcula el plan de pago. |
| CU-12 | Calcular mora | Sistema (automático) | Genera el cargo de mora una única vez por cuota y actualiza días de atraso para reporte. |
| CU-13 | Generar reporte | Gerente / Administrador | Produce reportes financieros y operativos. |
| CU-14 | Pagar comisión | Administrador / Gerente | Marca una comisión de vendedor como pagada. |
| CU-15 | Anular/cancelar venta antes del inicial | Administrador / Gerente | Libera el solar bloqueado, devolviéndolo a Disponible. |

## 9. Reglas de negocio

* Un solar solo puede venderse si está en estado disponible o reservado.
* **Al registrarse una venta, el solar pasa de inmediato a "Bloqueado"** (no a "Vendido"); solo pasa a "Vendido" cuando se registra el cobro del inicial y el contrato se activa.
* Si la venta se anula o cancela antes del cobro del inicial, el solar regresa a "Disponible" (o a "Reservado" si aplicaba).
* Un solar en estado Vendido o Bloqueado no puede venderse nuevamente ni reservarse.
* No pueden existir dos solares con el mismo proyecto, manzana y número.
* El sistema debe evitar que dos ventas se completen simultáneamente sobre el mismo solar.
* Las reservas expiran automáticamente si no se concreta la venta dentro del plazo configurado.
* Toda venta genera de inmediato un contrato en estado "Pendiente de inicial" y su plan de pago preliminar; el cobro del inicial siempre debe estar asociado a ese contrato.
* El contrato pasa a "Activo" automáticamente al registrarse el cobro del inicial, habilitando el plan de pago y marcando el solar como "Vendido".
* Mientras el contrato esté en "Pendiente de inicial", no se admite ningún cobro distinto al tipo Inicial.
* Los cobros de tipo Cuota, Mora, Adelanto y Abono a capital solo pueden registrarse cuando el contrato está en estado operativo "Activo" o "En mora".
* "Renegociado" no es un estado operativo del contrato: es una condición derivada de la existencia de registros en `Renegociaciones`.
* Una venta debe generar un plan de pago; la suma del capital de las cuotas vigentes debe igualar el monto financiado vigente.
* Un adelanto se aplica a una cuota futura específica sin modificar su monto.
* Un abono a capital reduce el capital pendiente y obliga, en el mismo proceso, a registrar una renegociación que recalcule el plan de pago.
* `Ventas.monto_cuota` es un valor de referencia inicial; la fuente vigente de los montos de cuota es siempre la tabla `Cuotas`.
* Una cuota genera mora cuando permanece pendiente o parcialmente pagada después de 5 días calendario desde su vencimiento.
* La mora se calcula una única vez, al momento en que se supera el período de gracia, y queda congelada como cargo generado.
* La mora admite pagos parciales sobre el cargo ya congelado.
* No puede existir más de una mora en estado Pendiente o Parcialmente pagada para la misma cuota.
* Todo porcentaje configurado (mora, impuesto) se almacena y se opera como fracción decimal.
* El balance del contrato, de cada cuota y de cada mora nunca se almacena como campo fijo editable: siempre se calcula dinámicamente.
* Los recibos anulados no afectan el balance del cliente.
* Toda renegociación conserva el historial de condiciones anteriores y no altera el estado operativo del contrato.
* Solo usuarios autorizados pueden anular ventas, contratos o recibos, aprobar renegociaciones y abonos a capital, o ajustar una mora ya generada.
* El sistema guarda auditoría de toda acción crítica y de creación/modificación en las tablas financieras y de configuración.
* Todos los montos del sistema se expresan en la moneda configurada como predeterminada.

## 10. Validaciones del sistema

* El monto inicial no puede ser mayor al precio total del solar.
* El monto financiado debe ser igual al precio total menos el monto inicial.
* No se permiten cuotas con monto igual a cero.
* La suma de capital e interés de una cuota debe ser igual a su monto total.
* La suma del capital de todas las cuotas vigentes debe coincidir con el monto financiado vigente.
* No se puede vender ni reservar un solar en estado Bloqueado, Vendido o Anulado.
* No se puede registrar un solar duplicado dentro del mismo proyecto y manzana.
* **No se puede marcar un solar como "Vendido" si su contrato asociado no está en estado "Activo"** (es decir, sin cobro del inicial registrado).
* `Cobros.id_contrato` es obligatorio en todos los casos, incluido el cobro del inicial.
* No se puede registrar un cobro de tipo Cuota, Mora, Adelanto o Abono a capital si el contrato no está en estado "Activo" o "En mora".
* El cobro tipo Inicial solo puede registrarse mientras el contrato está en "Pendiente de inicial".
* No se puede activar un contrato sin el cobro del inicial registrado, si `requiere_inicial_pagado_para_activar_contrato = true`.
* Al anular o cancelar una venta antes del cobro del inicial, el solar debe regresar automáticamente a "Disponible" (o "Reservado" si correspondía).
* No se puede registrar un cobro con monto igual o menor a cero.
* La suma de los montos aplicados en el detalle de un cobro debe ser igual al monto total del recibo.
* Reglas por tipo de aplicación en `Detalle_Cobro`: Cuota y Adelanto requieren `id_cuota` (`id_mora` nulo); Mora requiere `id_mora` (`id_cuota` nulo); Inicial y Abono a capital requieren ambos nulos.
* No se puede registrar un cobro con `tipo_aplicacion = Abono a capital` sin crear en la misma transacción una renegociación asociada.
* No se puede renegociar un contrato que no esté en estado "Activo" o "En mora".
* No se puede registrar un cobro que exceda el balance pendiente del contrato, salvo que se registre como abono a capital o adelanto.
* No se puede calcular mora sobre una cuota que aún esté dentro de su período de gracia.
* No se puede crear un segundo registro de mora en estado Pendiente/Parcialmente pagada para una cuota que ya tiene uno vigente.
* Una vez generado, `Mora.monto_mora` no puede modificarse por el proceso automático; solo mediante anulación, ajuste autorizado o renegociación explícita.
* Un cobro aplicado a mora no puede exceder el `balance_pendiente_mora` vigente.
* El monto de una mora no puede calcularse sobre un balance de cuota igual a cero.
* No se puede anular un recibo sin especificar un motivo.
* No se puede anular una venta o contrato saldado sin un permiso especial de administrador.
* No se puede modificar una venta saldada, salvo mediante el proceso formal de renegociación.
* No se permite registrar cédula o RNC duplicados, si la empresa así lo define.
* No se puede eliminar físicamente un registro con historial de transacciones asociadas; solo se permite inactivar o anular.
* Toda renegociación requiere motivo y usuario autorizante.
* No se puede marcar una comisión como pagada sin usuario y fecha de pago registrados.
* Todo cambio en `Configuracion` debe quedar registrado con usuario y fecha de modificación.
* Todo valor de tipo porcentaje en `Configuracion` debe almacenarse como fracción decimal (0–1).

## 11. Estados de las entidades

| Entidad | Estados almacenados |
|---|---|
| Solar | Disponible · Reservado · Bloqueado · Vendido · Anulado |
| Reserva | Activa · Expirada · Cancelada · Convertida en venta |
| Venta | Activa · Saldada · Anulada · En mora · Cancelada |
| Contrato | Pendiente de inicial · Activo · En mora · Saldado · Cancelado · Anulado |
| Cuota | Pendiente · Pagada · Parcialmente pagada · Vencida · Anulada |
| Cobro (recibo) | Registrado · Anulado |
| Mora | Pendiente · Parcialmente pagada · Pagada · Anulada |
| Comisión | Pendiente · Pagada |
| Usuario | Activo · Inactivo |
| Proyecto | Activo · Inactivo |

**Correspondencia Contrato ↔ Solar:** `Pendiente de inicial` ↔ `Bloqueado`; `Activo`/`En mora`/`Saldado` ↔ `Vendido`; `Cancelado`/`Anulado` (si ocurrió antes del inicial) ↔ `Disponible` (o `Reservado`).

**Etiquetas derivadas (no almacenadas):** "En mora" sobre una cuota `Vencida` cuando existe un registro vigente en `Mora`; **"Renegociado"** sobre un contrato cuando existe al menos un registro en `Renegociaciones`.

## 12. Requerimientos funcionales

| Código | Descripción |
|---|---|
| RF-001 | Gestión de usuarios: crear, modificar, activar, desactivar y asignar permisos. |
| RF-002 | Gestión de clientes: registrar, consultar, modificar y desactivar. |
| RF-003 | Gestión de proyectos o urbanizaciones. |
| RF-004 | Gestión de solares, con validación de unicidad por proyecto/manzana/número. |
| RF-005 | Registro de ventas: bloquea el solar, genera el contrato "Pendiente de inicial" y el plan de pago preliminar. |
| RF-006 | Generación automática del plan de pago, con capital e interés diferenciados por cuota. |
| RF-007 | Registro de reservas de solares, con expiración automática configurable. |
| RF-008 | Registro del cobro formal del inicial: activa el contrato y el plan de pago, y marca el solar como "Vendido". |
| RF-009 | Bloqueo de cobros de tipo Cuota, Mora, Adelanto o Abono a capital salvo cuando el contrato está Activo o En mora. |
| RF-010 | Registro de adelantos, aplicados a una cuota futura específica sin modificar el plan de pago. |
| RF-011 | Registro de abonos a capital, forzando la creación de una renegociación asociada en la misma transacción. |
| RF-012 | Cálculo de la etiqueta derivada "Renegociado" a partir de la existencia de registros en `Renegociaciones`. |
| RF-013 | Liberación automática del solar (a Disponible/Reservado) si la venta se anula o cancela antes del cobro del inicial. |
| RF-014 | Generación de recibos por cada cobro registrado. |
| RF-015 | Cálculo dinámico del balance de contrato, de cada cuota y de cada mora (campos no almacenados). |
| RF-016 | Consulta del estado de cuenta de cada cliente. |
| RF-017 | Generación de reportes de ventas, cobros, balances pendientes, reservas, solares y contratos renegociados. |
| RF-018 | Registro de auditoría de acciones importantes y de creación/modificación en tablas financieras y de configuración. |
| RF-019 | Control de concurrencia al bloquear/vender un solar. |
| RF-020 | Renegociación de contratos en estado Activo o En mora, con recálculo formal del plan de pago, y su historial. |
| RF-021 | Cálculo de impuestos sobre venta o cobro, configurable desde parámetros generales. |
| RF-022 | Gestión de comisiones de vendedores: cálculo, consulta y registro de pago. |
| RF-023 | Aplicación de la matriz de permisos por rol, configurable desde el módulo de seguridad. |
| RF-024 | Validación de las reglas de integridad descritas en la sección 10 antes de confirmar cualquier transacción. |
| RF-025 | Administración de parámetros generales del sistema desde un módulo de configuración, con porcentajes en formato decimal. |
| RF-026 | Manejo de una moneda predeterminada configurable para todos los montos del sistema. |
| RF-027 | Cálculo automático de mora como cargo único congelado, con período de gracia configurable, soporte de pagos parciales y sin recalcular el monto ya generado. |

## 13. Requerimientos no funcionales

| Categoría | Descripción | Meta sugerida |
|---|---|---|
| Seguridad | Autenticación, roles y permisos. | Contraseñas cifradas; sesión con expiración por inactividad. |
| Disponibilidad | Disponible en horario operativo. | 99% de disponibilidad en horario operativo. |
| Usabilidad | Pantallas claras y procesos simples. | Procesos críticos completables en máximo 3-4 pasos. |
| Rendimiento | Respuesta rápida en consultas y reportes. | Consultas simples < 2 seg; reportes complejos < 8 seg; cálculo de balance y mora < 1 seg. |
| Integridad de datos | Evitar duplicidad y errores en balances. | Balance, monto pagado, mora activa y correspondencia contrato↔solar siempre consistentes. |
| Respaldo de información | Backup periódico. | Backup automático diario, retención mínima de 30 días. |
| Auditoría | Registro de acciones críticas y trazabilidad de cambios. | Retención de logs por un mínimo de 1 año. |
| Concurrencia | Soporte de múltiples usuarios simultáneos. | Definir número esperado según tamaño de la operación. |
| Escalabilidad | Capacidad de crecer en volumen de datos. | Diseño de base de datos normalizado, con índices sobre campos de búsqueda frecuente. |

## 14. Modelo de datos preliminar

**Campos de auditoría estándar** — aplican a: Clientes, Proyectos, Solares, Reservas, Ventas, Contratos, Renegociaciones, Cuotas, Cobros, Mora, Comisiones, Configuracion (*):

| Campo | Tipo | Notas |
|---|---|---|
| fecha_creacion | Fecha/hora | |
| fecha_modificacion | Fecha/hora | Nulo si no ha sido modificado |
| id_usuario_crea | FK → Usuarios | |
| id_usuario_modifica | FK → Usuarios | Nulo si no ha sido modificado |

### 14.1 Tabla: Usuarios
| Campo | Tipo | Notas |
|---|---|---|
| id_usuario | PK | |
| nombre | Texto | |
| correo | Texto | Único |
| nombre_acceso | Texto | Único |
| password_hash | Texto | |
| id_rol | FK → Roles | |
| estado | Texto | Activo / Inactivo |
| fecha_creacion | Fecha/hora | |

### 14.2 Tabla: Roles
| Campo | Tipo | Notas |
|---|---|---|
| id_rol | PK | |
| nombre_rol | Texto | |
| descripcion | Texto | |

### 14.3 Tabla: Permisos_Rol
| Campo | Tipo | Notas |
|---|---|---|
| id_permiso | PK | |
| id_rol | FK → Roles | |
| funcion | Texto | |
| permitido | Booleano | |

### 14.4 Tabla: Clientes (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_cliente | PK | |
| nombre_completo | Texto | |
| cedula_rnc | Texto | Único, según regla de negocio |
| telefono | Texto | |
| correo | Texto | |
| direccion | Texto | |
| fecha_nacimiento | Fecha | |
| estado_civil | Texto | |
| ocupacion | Texto | |
| estado | Texto | Activo / Inactivo |
| *+ auditoría estándar* | | |

### 14.5 Tabla: Proyectos (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_proyecto | PK | |
| nombre | Texto | |
| ubicacion | Texto | |
| descripcion | Texto | |
| cantidad_solares | Numérico | |
| estado | Texto | Activo / Inactivo |
| *+ auditoría estándar* | | |

### 14.6 Tabla: Solares (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_solar | PK | |
| id_proyecto | FK → Proyectos | |
| manzana | Texto | |
| numero_solar | Texto | |
| metros_cuadrados | Decimal | |
| precio_por_metro | Decimal | |
| precio_total | Decimal | |
| estado | Texto | Disponible / Reservado / Bloqueado / Vendido / Anulado |
| tipo_bloqueo | Texto | Venta pendiente de inicial / Administrativo / Legal / Otro — nulo si estado != Bloqueado |
| *+ auditoría estándar* | | |

**Restricción única:** (`id_proyecto`, `manzana`, `numero_solar`).

### 14.7 Tabla: Reservas (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_reserva | PK | |
| id_solar | FK → Solares | |
| id_cliente | FK → Clientes | |
| id_vendedor | FK → Usuarios | |
| fecha_reserva | Fecha | |
| fecha_expiracion | Fecha | |
| estado | Texto | Activa / Expirada / Cancelada / Convertida en venta |
| *+ auditoría estándar* | | |

### 14.8 Tabla: Ventas (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_venta | PK | |
| id_cliente | FK → Clientes | |
| id_solar | FK → Solares | Se bloquea al crear esta fila |
| id_reserva | FK → Reservas | Nulo si fue venta directa |
| id_vendedor | FK → Usuarios | |
| fecha_venta | Fecha | |
| precio_total | Decimal | |
| monto_inicial | Decimal | Debe coincidir con el cobro tipo Inicial |
| monto_financiado | Decimal | Capital a financiar; se actualiza tras renegociación |
| cantidad_cuotas | Numérico | Valor de referencia inicial |
| monto_cuota | Decimal | Referencial únicamente |
| frecuencia_pago | Texto | Mensual / Quincenal / Semanal / Personalizada |
| fecha_primer_pago | Fecha | |
| estado | Texto | Activa / Saldada / Anulada / En mora / Cancelada |
| *+ auditoría estándar* | | |

### 14.9 Tabla: Contratos (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_contrato | PK | |
| numero_contrato | Texto | Único |
| id_venta | FK → Ventas | Se crea junto con la venta |
| fecha_contrato | Fecha | |
| condiciones_pago | Texto | |
| estado | Texto | Pendiente de inicial / Activo / En mora / Saldado / Cancelado / Anulado |
| *+ auditoría estándar* | | |

*El cambio de este `estado` a "Activo" debe disparar, en la misma transacción, el cambio de `Solares.estado` a "Vendido". No almacena balance ni monto pendiente — ver sección 15.*

### 14.10 Tabla: Renegociaciones (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_renegociacion | PK | |
| id_contrato | FK → Contratos | La existencia de al menos una fila aquí marca al contrato como "Renegociado" (derivado) |
| id_cobro_origen | FK → Cobros | No nulo cuando la renegociación fue disparada por un abono a capital |
| fecha | Fecha | |
| motivo | Texto | |
| condiciones_anteriores | Texto/JSON | |
| condiciones_nuevas | Texto/JSON | |
| id_usuario_autoriza | FK → Usuarios | |
| *+ auditoría estándar* | | |

### 14.11 Tabla: Cuotas (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_cuota | PK | |
| id_contrato | FK → Contratos | **Referencia al contrato, no a la venta (decisión de esta versión)** |
| numero_cuota | Numérico | |
| fecha_vencimiento | Fecha | |
| monto | Decimal | capital + interes |
| capital | Decimal | |
| interes | Decimal | |
| estado | Texto | Pendiente / Pagada / Parcialmente pagada / Vencida / Anulada |
| *+ auditoría estándar* | | |

**No incluye** `monto_pagado` ni `balance_pendiente` — se calculan mediante vista (sección 15).

*`id_venta` no se duplica aquí: si se necesita, se obtiene navegando `Cuotas → Contratos → Ventas` (vía `Contratos.id_venta`). Esto evita que `Cuotas` pueda quedar inconsistente con la venta si en el futuro un contrato se asociara a otra venta (ej. traspaso formal).*

### 14.12 Tabla: Cobros (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_cobro | PK | |
| numero_recibo | Texto | Único |
| id_cliente | FK → Clientes | |
| id_contrato | FK → Contratos | Obligatorio siempre, incluido el cobro del inicial |
| id_usuario | FK → Usuarios | |
| fecha_pago | Fecha | |
| monto_total | Decimal | |
| metodo_pago | Texto | |
| referencia_pago | Texto | |
| modalidad_aplicacion | Texto | Automática / Cuota específica / Abono a capital |
| estado | Texto | Registrado / Anulado |
| motivo_anulacion | Texto | Obligatorio si Anulado |
| fecha_anulacion | Fecha | |
| id_usuario_anula | FK → Usuarios | |
| *+ auditoría estándar* | | |

### 14.13 Tabla: Detalle_Cobro
| Campo | Tipo | Notas |
|---|---|---|
| id_detalle_cobro | PK | |
| id_cobro | FK → Cobros | |
| id_cuota | FK → Cuotas | Obligatorio si tipo_aplicacion es Cuota o Adelanto |
| id_mora | FK → Mora | Obligatorio si tipo_aplicacion es Mora |
| tipo_aplicacion | Texto | Inicial / Cuota / Mora / Adelanto / Abono a capital |
| monto_aplicado | Decimal | |

*Todo registro con `tipo_aplicacion = Abono a capital` debe estar vinculado a una fila en `Renegociaciones.id_cobro_origen`, creada en la misma transacción.*

### 14.14 Tabla: Mora (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_mora | PK | |
| id_cuota | FK → Cuotas | |
| fecha_inicio_mora | Fecha | |
| dias_atraso | Numérico | Único campo que el scheduler puede actualizar libremente |
| porcentaje_mora | Decimal | Fracción decimal (0.02 = 2%). Congelado al generarse |
| balance_base_calculo | Decimal | Balance de la cuota al momento del cálculo. Congelado |
| monto_mora | Decimal | Congelado al generarse; solo modificable por ajuste/anulación/renegociación |
| estado | Texto | Pendiente / Parcialmente pagada / Pagada / Anulada |
| fecha_calculo | Fecha | |
| *+ auditoría estándar* | | |

**No incluye** `monto_pagado_mora` ni `balance_pendiente_mora` — se calculan mediante vista (sección 15).

**Restricción única:** índice único filtrado sobre (`id_cuota`) donde `estado IN ('Pendiente', 'Parcialmente pagada')`.

### 14.15 Tabla: Comisiones (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_comision | PK | |
| id_venta | FK → Ventas | |
| id_vendedor | FK → Usuarios | |
| porcentaje_o_monto | Decimal | Fracción decimal si es porcentaje |
| base_incluye_inicial | Booleano | |
| monto_comision | Decimal | |
| fecha_generacion | Fecha | |
| fecha_pago | Fecha | |
| id_usuario_paga | FK → Usuarios | |
| estado | Texto | Pendiente / Pagada |
| *+ auditoría estándar* | | |

### 14.16 Tabla: Configuracion (*)
| Campo | Tipo | Notas |
|---|---|---|
| id_configuracion | PK | |
| clave | Texto | Único |
| valor | Texto | Porcentajes en fracción decimal |
| descripcion | Texto | |
| estado | Texto | Activo / Inactivo |
| *+ auditoría estándar* | | |

### 14.17 Tabla: Auditoria
| Campo | Tipo | Notas |
|---|---|---|
| id_auditoria | PK | |
| id_usuario | FK → Usuarios | |
| accion | Texto | |
| entidad_afectada | Texto | |
| id_entidad_afectada | Texto | |
| fecha_hora | Fecha/hora | |
| detalle | Texto/JSON | |

### 14.18 Tabla: Documentos_Contrato *(fuera de alcance de la v1.0)*
| Campo | Tipo | Notas |
|---|---|---|
| id_documento | PK | |
| id_contrato | FK → Contratos | |
| nombre_archivo | Texto | |
| ruta_archivo | Texto | |
| tipo_documento | Texto | |
| fecha_subida | Fecha/hora | |
| id_usuario_subio | FK → Usuarios | |

El diagrama entidad-relación deberá elaborarse en la etapa de diseño técnico tomando como base este modelo.

## 15. Cálculo del balance del contrato, de cada cuota y de cada mora

### 15.1 Balance de una cuota

```
monto_pagado_cuota      = suma(Detalle_Cobro.monto_aplicado
                                donde id_cuota = esta cuota
                                y Cobro.estado = 'Registrado')

balance_pendiente_cuota = Cuota.monto - monto_pagado_cuota
```

### 15.2 Balance de una mora

```
monto_pagado_mora      = suma(Detalle_Cobro.monto_aplicado
                               donde id_mora = esta mora
                               y Cobro.estado = 'Registrado')

balance_pendiente_mora = Mora.monto_mora - monto_pagado_mora
```

### 15.3 Balance del contrato

```
balance_contrato =
    suma(Cuotas.monto donde estado != 'Anulada')
  - suma(Detalle_Cobro.monto_aplicado aplicado a cuotas, Cobro.estado = 'Registrado')
  + suma(Mora.monto_mora - monto_pagado_mora, para moras con estado Pendiente o Parcialmente pagada)
```

Aplica solo cuando `Contratos.estado` es `Activo` o `En mora`. Mientras esté en "Pendiente de inicial", el balance relevante es `monto_inicial - cobro_inicial_registrado`, y el solar permanece en "Bloqueado".

### 15.4 Etiqueta derivada "Renegociado"

```
es_renegociado(contrato) = existe al menos una fila en Renegociaciones donde id_contrato = este contrato
```

Toda esta lógica (15.1 a 15.4) debe implementarse como vistas o funciones de solo lectura.

## 16. Pantallas principales

* Inicio de sesión.
* Panel principal.
* Mantenimiento de usuarios y permisos.
* Registro de clientes, proyectos y solares.
* Gestión de reservas.
* Registro de ventas (bloquea el solar, genera contrato "Pendiente de inicial" + plan preliminar).
* Cobro del inicial (activa contrato, plan y marca el solar Vendido).
* Plan de pago.
* Registro de cobros (bloqueado para cuota/mora/adelanto/abono salvo Activo o En mora).
* Consulta de estado de cuenta.
* Reportes (ventas, cobros, mora, comisiones, renegociaciones, solares por estado).
* Bitácora de auditoría.
* Configuración general.

## 17. Ejemplos de proceso

### 17.1 Proceso de venta

1. El usuario registra al cliente y consulta solares disponibles.
2. El cliente selecciona un solar (con o sin reserva previa).
3. El usuario registra la venta; el sistema **bloquea el solar** de inmediato.
4. El sistema genera el contrato en estado "Pendiente de inicial" y el plan de pago preliminar.
5. El usuario registra el cobro del inicial, asociado a ese contrato; el contrato pasa a "Activo", el plan de pago se habilita, y **el solar pasa a "Vendido"**.
6. El cliente realiza pagos periódicos; el sistema genera (una sola vez, congelada) la mora de cada cuota que supera el período de gracia.
7. Si el cliente hace un abono a capital, el sistema exige una renegociación que recalcula el plan de pago.
8. Al completar los pagos, la venta y el contrato quedan saldados.

*Variante: si la venta se anula antes de cobrar el inicial, el solar regresa automáticamente a "Disponible".*

### 17.2 Proceso de cobro

1. El usuario busca al cliente y selecciona el contrato.
2. Si el contrato está "Pendiente de inicial" (solar "Bloqueado"), solo se permite registrar el cobro del inicial.
3. Si el contrato está "Activo" o "En mora" (solar "Vendido"), el sistema muestra cuotas pendientes, vencidas, en mora y el balance total.
4. El usuario registra el monto y selecciona el tipo de aplicación.
5. Si el tipo es "Abono a capital", el sistema abre el flujo de renegociación antes de confirmar el cobro.
6. Si el tipo es "Mora", el sistema permite un monto menor al `balance_pendiente_mora` sin alterar el cargo original.
7. El sistema valida contra el balance calculado y aplica el pago.
8. El sistema genera el recibo; los balances se recalculan en la siguiente consulta.

## 18. Extensiones futuras (fuera del alcance de la v1.0)

* Pasarela de pago en línea para el cliente.
* Envío automático de recibos y recordatorios por correo o WhatsApp.
* Exportación de movimientos contables hacia un sistema externo.
* Firma electrónica de contratos.
* Portal de autoconsulta para clientes.
* Gestión documental completa de contratos.
* Soporte de múltiples monedas.
* Tabla independiente `Impuestos`.
* Mora diaria acumulativa.
* Opción B de abonos a capital (crédito no distribuido, sin renegociación).

## 19. Beneficios del sistema

* Mayor control de solares en sus 5 estados (disponible, reservado, bloqueado, vendido, anulado), sin ambigüedad sobre cuándo un solar realmente está vendido.
* Secuencia venta → solar bloqueado → contrato → plan preliminar → inicial → solar vendido, completamente trazable.
* Separación clara entre adelanto, abono a capital, cuota e inicial.
* Estado operativo del contrato limpio, con "Renegociado" como distintivo informativo separado.
* Mora predecible: un cargo que se genera una vez y no cambia por sorpresa, con soporte de pagos parciales.
* Balance de contrato, cuota y mora siempre consistentes entre sí.
* Trazabilidad completa mediante auditoría.
* Parámetros de negocio ajustables sin tocar código.
* Base sólida para escalar hacia integraciones futuras.

## 20. Conclusión

La Versión 6.6 incorpora dos ajustes de diseño físico que ya se decidieron con suficiente claridad como para fijarlos en la especificación: el campo `tipo_bloqueo` en `Solares`, que distingue un bloqueo por venta pendiente de inicial (con liberación automática) de un bloqueo administrativo o legal (sin liberación automática); y la decisión de que `Cuotas` referencia `id_contrato` en lugar de `id_venta`, evitando duplicidad de la relación y apoyándose en que cobros, mora, renegociación y balance ya giran alrededor del contrato. Con esto, el documento queda **congelado como base oficial de la Versión 1.0 Producción**, lista para el diagrama entidad-relación, el diccionario de datos físico, las vistas SQL y el script inicial de base de datos.

## 21. Próximos entregables técnicos

* Diagrama entidad-relación.
* Diccionario de datos físico (tipos exactos, longitudes, índices, restricciones únicas —incluyendo el índice único filtrado de mora activa—).
* ~~Definición de si `Cuotas` referencia venta o contrato~~ — decidido en esta versión: `Cuotas.id_contrato` (ver 14.11); `id_venta` se obtiene por navegación, no se duplica.
* Vistas SQL: balance por cuota, balance por mora, balance por contrato, bandera derivada "es_renegociado".
* Triggers o lógica transaccional para: bloqueo del solar al registrar la venta; activación de contrato + habilitación del plan + solar a "Vendido" al cobrar el inicial; liberación del solar si la venta se anula antes del inicial; abono a capital + renegociación en una sola transacción; congelamiento de `monto_mora` tras su generación.
* Script inicial de base de datos.
* Job/scheduler diario que genere el cargo de mora una única vez por cuota y actualice `dias_atraso` sin tocar `monto_mora` en registros existentes.
* Prototipo de pantallas.
* Historias de usuario derivadas de los casos de uso.
* Diseño de arquitectura técnica.
* Plan de pruebas, con casos límite: venta anulada antes del inicial (el solar debe liberarse), cobro de cuota mientras el contrato está "Pendiente de inicial" (debe rechazarse), renegociación sobre un contrato "Saldado" o "Anulado" (debe rechazarse), día 5 vs. día 6 de mora, pago parcial de la cuota después de generada la mora (el monto de mora no debe cambiar), pago parcial de mora, abono a capital sin renegociación (debe rechazarse), adelanto sin cuota asociada (debe rechazarse).
* Manual de usuario por rol.
