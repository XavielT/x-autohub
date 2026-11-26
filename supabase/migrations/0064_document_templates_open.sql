-- =============================================================================
-- 0064 · Las plantillas de documentos dejan de estar cerradas en la base
-- =============================================================================
--
-- La 0063 limitaba `business_documents.template` a seis nombres con un `check`. Cada plantilla nueva (hoy
-- "chequeo" y "precompra", la revisión de un vehículo antes de comprarlo) obligaba a otra migración. Las
-- plantillas son del frontend (`document-templates.ts`): la base solo guarda cuál se usó, así que aquí
-- basta con que sea un texto corto y no vacío.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.business_documents drop constraint if exists business_documents_template_check;
alter table public.business_documents drop constraint if exists business_documents_template_valid;

alter table public.business_documents
  add constraint business_documents_template_valid
  check (length(btrim(template)) between 1 and 40);
