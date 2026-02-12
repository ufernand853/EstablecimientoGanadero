# Propuesta: ficha individual de animal con fotos

Esta propuesta permite registrar animales particulares (por ejemplo toros de pedigrí) con una ficha propia y fotos asociadas.

## 1) Identificación única

Usar **nro de caravana** como identificador principal (`earTag`) y un id interno (`animalId`) generado por el sistema.

Campos sugeridos:
- `animalId` (UUID)
- `earTag` (nro de caravana, único)
- `nombre`
- `sexo`
- `raza`
- `fechaNacimiento`
- `categoria` (toro, vaca, vaquillona, etc.)
- `estado` (activo, vendido, muerto)
- `observaciones`

## 2) Fotos por animal

Crear una colección/tabla `animal_photos` relacionada por `animalId`.

Campos sugeridos:
- `photoId`
- `animalId`
- `urlOriginal`
- `urlThumb`
- `uploadedAt`
- `uploadedBy`
- `caption` (ej: "Toro en servicio 2026")
- `takenAt` (fecha de la foto)

## 3) Flujo de carga recomendado

1. Buscar animal por caravana o nombre.
2. Abrir su ficha.
3. Subir 1 o varias fotos.
4. Guardar comentario y fecha de toma.
5. Ver galería histórica dentro de la ficha.

Esto evita que queden fotos sueltas sin asociación.

## 4) Dónde guardar archivos (simple y escalable)

- **Producción recomendada**: almacenamiento tipo objeto (S3, Cloudflare R2 o MinIO).
- **Para empezar rápido**: carpeta local en servidor (`/uploads`) con backup diario.

Estructura sugerida de rutas:
- `animals/{animalId}/YYYY/MM/{photoId}.jpg`

## 5) Validaciones clave

- Caravana única.
- Tamaño máximo por imagen (ej. 10 MB).
- Tipos permitidos (`jpg`, `png`, `webp`).
- Generar miniatura automáticamente para lista/galería.

## 6) UX mínima recomendada

En la ficha individual:
- Encabezado con `caravana + nombre + categoría + edad`.
- Botón **Subir foto**.
- Galería con miniaturas y fecha.
- Campo de notas por foto.

## 7) Implementación por etapas

### Etapa 1 (rápida)
- Ficha básica de animal.
- Carga de fotos (1 a 1).
- Galería simple.

### Etapa 2
- Carga múltiple.
- Filtros por fecha/tipo.
- Foto principal destacada.

### Etapa 3
- Integración con eventos (sanidad, servicio, tacto, etc.) para ver fotos por evento.

## 8) Endpoints API sugeridos

- `POST /animals`
- `GET /animals?earTag=...&name=...`
- `GET /animals/:animalId`
- `POST /animals/:animalId/photos`
- `GET /animals/:animalId/photos`
- `DELETE /animals/:animalId/photos/:photoId`

## 9) Valor práctico para tu caso

Para toros de pedigrí, esta ficha te da:
- Trazabilidad visual en el tiempo.
- Registro individual con caravana + nombre.
- Historial útil para compras/ventas y decisiones de manejo.
