# EstablecimientoGanadero — Documentación Comercial

**Plataforma de Gestión Integral para Ganadería Extensiva**

---

## Resumen Ejecutivo

**EstablecimientoGanadero** es una plataforma SaaS diseñada para la gestión operativa y administrativa de establecimientos ganaderos. Permite a operarios, supervisores y administradores registrar, consultar y trazabilizar todas las actividades del campo mediante comandos en español natural — escritos o dictados por voz — interpretados por inteligencia artificial.

La plataforma cubre el ciclo completo: sanidad animal, reproducción, movimiento de hacienda, gestión de insumos veterinarios, envíos a frigorífico y trazabilidad individual por caravana.

---

## Propuesta de Valor

| Problema | Solución |
|----------|----------|
| Registros en papel que se pierden o deterioran | Sistema digital en la nube, accesible desde cualquier dispositivo |
| El operario de campo no sabe usar software complejo | Interfaz conversacional: escribe o dicta en español simple |
| Falta de trazabilidad ante auditorías sanitarias o exportaciones | Historial inmutable de eventos por animal y por lote |
| Medicamentos vencidos o sin stock cuando se necesitan | Control de lotes con alertas de vencimiento y descuento automático |
| El supervisor no sabe qué pasa en tiempo real | Panel centralizado con feed de actividades y tareas asignables |
| Gestión de múltiples campos difícil de coordinar | Arquitectura multi-establecimiento desde una sola cuenta |

---

## A Quién Está Dirigido

- **Estancieros y propietarios** que buscan digitalizar su campo sin complejidad técnica
- **Supervisores y encargados** que necesitan control operativo en tiempo real
- **Operarios de campo** que trabajan con guantes y necesitan registrar eventos rápido, sin formularios complicados
- **Asesores veterinarios** que gestionan la sanidad de múltiples establecimientos
- **Empresas agropecuarias** con varios campos que requieren visibilidad centralizada

---

## Cómo Funciona

### 1. El operario habla con el sistema

El operario en el campo escribe o dicta un comando en español natural:

```
"Vacuné la 1842 con aftosa 2ml"
"Mover 120 terneros del Potrero 3 al Potrero 7"
"Murió una vaca en el potrero 5, accidente"
"Destetar 85 terneros del lote VAC-2025-01, peso 170kg"
```

### 2. La IA interpreta y propone

El sistema analiza el comando, identifica animales, productos, cantidades y fechas, y presenta una tarjeta de confirmación con el evento propuesto.

### 3. El operario confirma

Con un solo toque, el evento queda registrado. El sistema:
- Persiste el evento en el historial de trazabilidad
- Descuenta insumos del stock automáticamente
- Genera tareas de seguimiento si corresponde
- Notifica al supervisor

### 4. El supervisor tiene visibilidad total

Desde el panel de supervisión, puede ver todas las actividades del día, asignar tareas, revisar alertas de vencimientos y consultar el estado del stock de medicamentos.

---

## Módulos Principales

### Modo Campo (Operario)

Interfaz minimalista diseñada para uso en terreno, con guantes y en movimiento.

- Entrada de texto o voz en español
- Asistente con IA: interpreta el comando y propone la acción
- Confirmación de eventos críticos antes de guardar
- Consultas rápidas: stock por potrero, historial de animal, preñadas
- Registro de: vacunaciones, desparasitaciones, tratamientos, muertes, partos, movimientos, yerra, castración, envíos

### Panel de Supervisión

Vista centralizada para el encargado o supervisor.

- Feed de actividades en tiempo real
- Gestión de tareas: crear, asignar, priorizar, completar
- Recordatorios automáticos de vencimientos de vacunas y tratamientos
- Resumen operativo del día (KPIs de inicio de jornada)
- Reportes de incidentes

### Gestión de Sanidad

Control completo del plan sanitario.

- **Vacunaciones**: programación, ejecución y seguimiento de campañas
- **Desparasitaciones**: registro por lote con producto y dosis
- **Tratamientos**: seguimiento individual con período de retiro
- **Reproducción**: servicios, confirmación de preñez, partos
- **Incidentes**: registro de muertes, lesiones y eventos anormales

### Control de Insumos Veterinarios

Trazabilidad completa de medicamentos y vacunas.

- Ficha maestra por producto (principio activo, dosis, período de retiro)
- Gestión de lotes físicos con número, vencimiento, proveedor y ubicación
- Movimientos auditados: ingresos, consumos, ajustes, descartes
- **Lógica FEFO**: consume primero los lotes más próximos a vencer
- **Alertas automáticas**: productos por vencer o con stock bajo
- Descuento automático al confirmar eventos sanitarios

### Trazabilidad

Historial inmutable por animal y por lote.

- Registro de eventos por caravana (earTag) individual
- Tipos de evento: asignación de potrero, vacunación, preñez, traslado, muerte, consignación
- Dashboard de trazabilidad con resumen por categoría
- Consulta de historial completo de un animal por su número de caravana
- Preparado para certificaciones de exportación y auditorías sanitarias

### Operaciones Ganaderas

Registro de las principales operaciones del campo.

| Operación | Descripción |
|-----------|-------------|
| Movimiento de lotes | Traslado de N animales entre potreros |
| Destete | Separación de terneros con registro de peso promedio |
| Yerra | Marcación con opción de castración simultánea |
| Entore | Servicio con toros: registro de fechas de inicio y fin |
| Consignación a frigorífico | Envío de lotes por consignatario con precios y categorías |

### Gestión de Tareas

Coordinación entre supervisores y operarios.

- Crear y asignar tareas con prioridad y fecha límite
- Estados: pendiente, en progreso, completada
- Tipos: sanitaria, operativa, administrativa, seguimiento
- Alertas de vencimiento
- Historial de tareas por establecimiento

### Fichas Individuales de Animales

Para establecimientos que trabajan con animales identificados individualmente.

- Ficha por caravana: raza, sexo, fecha de nacimiento, categoría, estado
- Galería fotográfica con historial cronológico
- Historial completo de eventos del animal
- Búsqueda por número de caravana o nombre

### Administración del Sistema

Panel para propietarios y administradores.

- Gestión de usuarios: crear, editar, cambiar roles
- Roles disponibles: Propietario, Administrador, Supervisor, Operario, Solo lectura
- Configuración del asistente de IA: definir comportamientos esperados y casos de prueba
- Configuración de establecimientos y potreros
- Datos maestros: categorías de hacienda, consignatarios, frigoríficos

---

## Roles y Perfiles de Usuario

| Rol | Acceso | Uso típico |
|-----|--------|------------|
| **Propietario (Owner)** | Total | Dueño del establecimiento |
| **Administrador** | Total excepto billing | Gerente o encargado general |
| **Supervisor** | Operaciones y reportes | Encargado de campo, veterinario |
| **Operario** | Modo campo y confirmaciones | Personal de campo |
| **Solo lectura** | Consultas sin modificar | Asesor externo, auditor |

---

## Capacidades de la Inteligencia Artificial

El asistente de IA es el núcleo diferencial del sistema:

- **Comprensión de español natural**: no requiere comandos exactos ni sintaxis específica
- **Fuzzy matching**: entiende sinónimos, abreviaturas y errores ortográficos comunes
- **Reconocimiento de fechas**: "hoy", "ayer", "15/11", "2026-02-01"
- **Extracción de entidades**: animales, productos, dosis, cantidades, potreros
- **Nivel de confianza**: informa al operario qué tan seguro está de la interpretación
- **Confirmación humana**: acciones críticas siempre requieren aprobación del usuario
- **Configurable**: el administrador puede definir comportamientos y casos de uso específicos del establecimiento

---

## Datos Maestros y Configuración

El sistema incluye tablas maestras configurables por establecimiento:

- **Categorías de hacienda**: Terneros, Terneras, Vaquillonas, Vacas, Toros, Novillos, Vientres, y más
- **Potreros**: con nombre, superficie y capacidad
- **Consignatarios**: intermediarios para ventas
- **Frigoríficos**: destinos de sacrificio con datos de contacto
- **Insumos sanitarios**: fichas de productos veterinarios reutilizables

---

## Modelo Comercial

### Prueba Gratuita

- **5 días de acceso completo** sin necesidad de tarjeta de crédito
- Acceso a todas las funcionalidades
- Datos de prueba incluidos para explorar el sistema

### Suscripción

- Activación automática al completar el pago
- Acceso inmediato tras confirmación
- Facturación recurrente por establecimiento
- Sin límite de usuarios dentro del plan

### Alta y Onboarding

1. Registro desde la plataforma web
2. Configuración del establecimiento (potreros, categorías, datos maestros)
3. Alta de usuarios y asignación de roles
4. Carga inicial de stock actual
5. Capacitación disponible para equipo de campo

---

## Arquitectura y Seguridad

Información técnica relevante para equipos de TI y evaluadores corporativos.

| Aspecto | Detalle |
|---------|---------|
| **Tipo** | SaaS multi-tenant, instalable on-premise |
| **Frontend** | Next.js 14 — interfaz web responsive |
| **Backend** | API REST con Fastify (Node.js) |
| **Base de datos** | MongoDB (compatible con Amazon DocumentDB) |
| **Autenticación** | JWT con tokens de acceso y refresco |
| **Seguridad** | Passwords con hashing criptográfico, HMAC-SHA256 en webhooks |
| **Aislamiento** | Datos completamente separados por establecimiento |
| **Despliegue** | Linux/systemd + Nginx, o Docker-compatible |
| **Disponibilidad** | Preparado para alta disponibilidad en la nube |

---

## Casos de Uso Típicos

### Campo ganadero mediano (500–2.000 cabezas)

- 2–4 operarios registran eventos diariamente desde el celular
- 1 supervisor revisa el panel cada mañana
- El propietario accede con perfil de solo lectura para consultar desde cualquier lugar

**Beneficio principal**: eliminar cuadernos de campo, reducir errores de registro, tener trazabilidad para DICOSE/SNIG.

---

### Establecimiento con servicio veterinario externo

- El veterinario ingresa como Supervisor
- Accede a historial sanitario de todos los animales
- Programa vacunaciones y tratamientos
- El operario confirma ejecución desde el campo

**Beneficio principal**: coordinación remota sin llamadas telefónicas, registro automático de productos y dosis.

---

### Empresa con múltiples campos

- Un administrador gestiona todos los establecimientos
- Cada campo tiene su propio equipo y datos aislados
- Visibilidad centralizada desde una sola cuenta

**Beneficio principal**: estandarización de procesos, auditoría cruzada, reportes consolidados.

---

## Preguntas Frecuentes

**¿Se necesita conexión a internet permanente?**
La plataforma funciona en la nube. Para uso en terreno sin señal, recomendamos registrar los eventos al recuperar conectividad.

**¿Funciona en celular?**
Sí. La interfaz es completamente responsive, optimizada para uso en celular con una mano o con guantes.

**¿Qué pasa con los datos si cancelo la suscripción?**
Los datos permanecen disponibles por un período de gracia. Se puede exportar el historial completo en cualquier momento.

**¿Se puede instalar en servidores propios?**
Sí. El sistema puede desplegarse on-premise en infraestructura del cliente con soporte para instalación.

**¿Es compatible con DICOSE / SNIG?**
El sistema de trazabilidad está diseñado para ser compatible con los formatos requeridos por organismos de control ganadero. Consultar por integración directa.

**¿Cuántos usuarios se pueden agregar?**
No hay límite de usuarios por establecimiento dentro del plan contratado.

---

## Contacto y Demo

Para solicitar una demostración personalizada o consultar planes enterprise, contacte al equipo comercial.

---

*EstablecimientoGanadero — Digitalice su campo, simplifique su gestión.*
