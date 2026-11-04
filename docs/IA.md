# IA en X AutoHub

La IA de X AutoHub **no es un chatbot**: trabaja dentro de lo que el negocio ya hace (cargar catálogo, validar pagos,
moderar, buscar, cotizar el taller, cuidar el garaje). **Propone, rellena y explica; una persona revisa y aprueba.**

> Este documento es el de la ronda del Prompt 09 (→ 2.31.0). Dice qué existe **hoy** y qué falta; no describe nada que no
> esté en el código. La tabla de "Estado" de abajo es la fuente de verdad.

## Estado de la ronda

| Bloque | Qué es | Estado |
| ------ | ------ | ------ |
| 0 | Claves de SGC / csd-app → X AutoHub | **Hecho en lo local** (inventario, humo de las dos claves). **Falta**: cargar los secretos y desplegar las edges (ver "Pasos manuales") |
| 1 | Base común: migración 0050, `_shared`, `AiService`, sección en `/admin/ajustes` | **Hecho** |
| 2 | Catálogo asistido: migración 0051, edge `ai-product-ingest`, `/admin/inventario/cargar-ia`, número de parte | **Hecho** (probado con una API simulada; **sin fotos reales todavía**) |
| 3 | Comprobantes de transferencia: migración 0052, edge `ai-verify-proof`, insignia y panel en `/admin/pedidos` | **Hecho** (API simulada; sin comprobantes reales todavía) |
| 4 | Moderación asistida: migración 0053, edge `ai-moderate`, cola por riesgo y "Ocultado por la IA" en `/admin/moderacion` | **Hecho** (API simulada) |
| 5 | Búsqueda inteligente: migración 0054, edges `ai-parse-search` y `ai-match-models`, chips en `/buscar`, propuestas en admin | **Hecho** (API simulada) |
| 7 | Cotización del taller con triage: migración 0055, edge `ai-triage-quote`, `/servicios/cotizar` que guarda y sube fotos, pestaña Solicitudes | **Hecho** (API simulada) |
| 6 | Resumen diario: migración 0056, edge `ai-daily-digest`, tarjeta "Hoy en el negocio" en `/admin` | **Hecho** (API simulada) |
| 8 | Reseñas, fichas y SEO: migración **0057** (se renumeró para no dejar hueco), edges `ai-review-summary` y `ai-seo-product` | **Hecho** (API simulada) |
| 9 | Garaje y mantenimiento: migración **0058** (renumerada), edge `ai-maintenance-template`, tarjeta en Mi garaje, pestaña Guías | **Hecho** (API simulada) |
| 10 | Mensajes de WhatsApp (sin bot): edge `ai-draft-reply`, componente `app-wa-draft` en pedidos, citas y solicitudes | **Hecho** (API simulada; sin migración) |
| 11 | Google Maps: migración **0059**, edges `maps-autocomplete`, `maps-geocode` y `ai-normalize-address`, autocompletar en el checkout, "Abrir en Google Maps" en pedidos, búsqueda en el mapa de `location-select`, taller con "Cómo llegar" y JSON-LD | **Hecho** (Google y Anthropic simulados en las pruebas; la clave real solo se probó con el humo del bloque 0) |

Las migraciones nuevas son de la **0050** a la **0059**, sin huecos (los números de la tabla de arriba son los que planeó el prompt; las migraciones se renumeraron para no dejar ninguno).

## Reglas (no se negocian)

1. **Las claves viven solo en Edge Functions.** Ni `environment*.ts`, ni el bundle. `dist/` se revisa por `sk-ant`, `AIza` y los
   nombres de los secretos: cero (comprobado el 03/11/2026 con la 2.30.8 + esta ronda).
2. **La IA nunca toca dinero ni estados de pedido.** Nunca: cambiar estados, confirmar pagos, tocar stock o precios, aprobar o
   rechazar publicaciones de Hub Market, crear o publicar productos sin revisión, mandar un WhatsApp. Ni con interruptor.
3. **Todo contenido de usuario va como dato.** Reseñas, comentarios, descripciones y el texto de las fotos van dentro de
   `<datos>…</datos>` (`wrapData()`), el prompt de sistema dice que es dato y nunca instrucción, y antes de enviar se quitan
   cédulas, correos y teléfonos (`redactPii()`). No hay *tool use*: la IA solo devuelve JSON y todo cambio pasa por funciones SQL
   con chequeo de rol.
4. **Cada función nueva trae su interruptor** (`ai_feature_<nombre>` en `site_settings`) **y su registro de costo** (`ai_usage`).
5. **Si algo falla, el flujo sigue.** La edge responde `{ ok: false, code: 'ia_no_disponible' }` y el front sigue por el camino de
   siempre (`AiService.call()` nunca falla ni bloquea).

## Arquitectura

```
navegador ──(AiService / servicio del dominio)──► Edge Function ai-*  ──► Anthropic / Google
                                                     │  guard.ts: JWT + rol llamado COMO el usuario, CORS, tamaño, límite por IP
                                                     │  ai.ts:    interruptores + tope mensual ► llamada ► JSON validado ► ai_usage
                                                     ▼
                                              PostgREST con service_role (solo para escribir lo suyo)
```

- `supabase/functions/_shared/`: `ai.ts` (cliente de Anthropic: enrutado de modelo, esquema propio, timeout 25 s, un reintento en
  429/529, un reintento si el JSON no valida), `guard.ts` (acceso), `schema.ts` (validador sin librerías), `prices.ts` (**la**
  tabla de precios, en un solo archivo), `db.ts` (PostgREST).
- Modelos: `AI_MODEL_FAST` (Haiku, por defecto `claude-haiku-4-5-20251001`) para clasificar, moderar, buscar y redactar;
  `AI_MODEL_SMART` (`claude-sonnet-5`) solo donde hay visión o razonamiento que lo pide (catálogo, comprobantes, triage con fotos).
- Las imágenes llegan a la edge como **ruta de Storage** (bucket privado), no como base64 en la petición. **Decisión:** bajar a ≤1280 px
  se hace en el navegador al subir (`compressImage(file, 1280)`), no en la edge (Deno no trae un redimensionador sin dependencias
  nuevas); la edge exige un tope de bytes (1,5 MB por imagen, 4 MB por PDF) y descarta lo que lo pase.
- Los componentes nunca llaman a una edge: pasan por `AiService` (o el servicio de su dominio, p. ej. `AiCatalogService`). En modo
  simulado (`shouldUseMockData()`) la IA "no está disponible" y la app corre sin credenciales.

### Tope mensual (migración 0050)

`ai_budget_status()` suma `ai_usage` del mes (hora de RD) contra `ai_monthly_cap_usd` (por defecto **US$25**):

| Tier | Cuándo | Efecto |
| ---- | ------ | ------ |
| `ok` | < 80 % | — |
| `aviso` | ≥ 80 % | se avisa en `/admin/ajustes` |
| `sin_publico` | ≥ 90 % | se apagan las funciones abiertas a visitantes (`search`, `address`, `quote_triage`) |
| `apagado` | ≥ 100 % | todo apagado |

Además, lo público no puede gastar más del **30 %** del tope aunque no se haya llegado al 90 %. Google Maps tiene su tope propio
(`maps_monthly_cap_usd`, US$10) y cuenta las features `maps_*`. Si la base no deja leer el tope, **no se gasta**.

### Cómo apagarla

- Todo: `/admin/ajustes` → Inteligencia artificial → "IA encendida" (o `ai_enabled = false`).
- Una función: su interruptor (`ai_feature_catalog_ingest`, `ai_feature_proof_check`, `ai_feature_moderation`, `ai_feature_digest`,
  `ai_feature_search`, `ai_feature_quote_triage`, `ai_feature_maintenance`, `ai_feature_review_summary`, `ai_feature_seo`,
  `ai_feature_reply_draft`, `ai_feature_address`).
- Cortar el gasto de raíz: quitar el secreto `ANTHROPIC_API_KEY` de las edges (sin él todas responden `ia_no_disponible`).

Los ajustes son legibles por cualquiera (`site_settings` se lee en público): son interruptores y topes, no secretos.

## Catálogo asistido (bloque 2, migración 0051)

- **Número de parte.** `hub_parts.part_number` y `cross_refs` (con `part_number_norm` y `cross_refs_norm` mantenidas por un trigger:
  mayúsculas, sin espacios ni guiones). Entran al vector de búsqueda, y una búsqueda exacta por número (o por una equivalencia) sale
  de primera en `search_products()` y `suggest_products()`. Se editan en el formulario del producto, se ven en la ficha ("Número de
  parte") y el JSON-LD usa `mpn`. **`search_products()` no las devuelve** (columnas explícitas): el número solo llega a la ficha.
- **Borradores.** `ai_product_drafts` (solo admin) + bucket privado `ai-product-sources`. La edge `ai-product-ingest` hace dos llamadas
  por artículo: lectura visual (Sonnet) y redacción (Haiku, con tres productos de la misma categoría como ejemplo de tono).
  Valida todo contra la base **en el servidor**: la categoría tiene que ser de la lista, marcas y modelos se resuelven contra
  `vehicle_makes`/`vehicle_models` (lo que no resuelve va a `unmatched`), y **precio y cantidad solo salen si están impresos**
  (si no, quedan vacíos y marcados "falta").
- **Equivalencias y compatibilidades** de conocimiento general no se guardan solas: las equivalencias van aparte, "sin verificar" y
  desmarcadas; las compatibilidades salen desmarcadas y con "verificar". Solo lo impreso en la caja o la etiqueta sale marcado.
- **Duplicados.** `ai_find_duplicate_product()` (número de parte + marca, o nombre parecido). Un borrador con duplicado no se aprueba
  hasta que el admin confirme "es otro artículo" (lo exige un trigger).
- **Aprobar** usa el camino del panel (`AdminService.createPart` + `replaceFitments` + `addAlias`): el producto queda **inactivo**; "Aprobar
  y publicar" exige nombre, marca, categoría, precio y una foto de producto. Una lista de proveedor no trae fotos de producto: sale inactivo.
- **Precisión.** Al aprobar se guardan los campos que cambió el humano (`edited_fields`); `ai_catalog_accuracy()` da el % aceptado sin
  cambios por campo y se ve en `/admin/ajustes`.
- **Lote.** Hasta 30 fotos de golpe; `{ action: 'group' }` propone la agrupación por artículo y el admin la corrige a mano antes de procesar.
- No hay aún (a propósito): SEO por IA y texto alterno guardado (bloque 8); las propuestas de alias se muestran y se guardan al aprobar.
- Las fotos de origen quedan en el bucket privado: **no hay limpieza automática** (borrar de `storage.objects` por SQL deja el archivo huérfano;
  hace falta la API de Storage). Pendiente.

## Comprobantes de transferencia (bloque 3, migración 0052)

- **Disparo.** El trigger `orders_request_proof_check` (cuando `payment_proof_url` cambia a un valor no nulo) llama a la edge `ai-verify-proof` por `pg_net`. Usa
  tres secretos del Vault: `ai_functions_url` (`https://<ref>.supabase.co/functions/v1`), `ai_cron_secret` (el mismo valor que el secreto `AI_CRON_SECRET` de las
  edges) y `send_push_anon_key` (ya existe). Sin ellos no hace nada y **no falla** adjuntar el comprobante. "Releer" en `/admin/pedidos` llama a la edge con la sesión del admin.
- **La IA solo anota.** Lee monto, moneda, bancos, **últimos 4** de la cuenta de destino, referencia y fecha. El veredicto lo calcula SQL (`ai_proof_compare()`): monto igual al
  total, destino igual a una cuenta real de `bank_accounts` (las de ejemplo no cuentan), fecha ni anterior al pedido ni futura, y referencia no repetida en otro pedido (por
  hash). Cualquier bandera ⇒ "revisar"; "coincide" exige cero banderas. Nunca llama a `set_order_status()` ni escribe en `orders`.
- **Privacidad.** Solo se guarda el hash de la referencia y sus últimos 4; nunca números de cuenta completos ni el titular.
- **Panel.** Insignia ("IA: Coincide / Revisar / Ilegible"), tabla "Lo que leí vs. lo que esperaba", botón "Releer", y los que coinciden suben al principio. Si coincide, push a admins
  (`send-push` ganó el tipo `proof_ready`, que vuelve a comprobar en la base que el último veredicto sea "coincide"). **`send-push` se despliega antes que la migración.**
- Un archivo que no se puede abrir (muy grande o raro) se anota "ilegible" y se mira a mano. Un 500 de Anthropic no anota nada.

## Moderación asistida (bloque 4, migración 0053)

- **La IA sugiere; un moderador decide.** `ai_moderation` guarda riesgo (bajo/medio/alto), categorías, motivo, sugerencia (aprobar/revisar/rechazar) y confianza. La cola de
  `/admin/moderacion` se ordena por riesgo, con chips de razones; "Aplicar sugerencia" **solo prellena** (en un rechazo deja el motivo escrito) y el moderador confirma.
- **Hub Market nunca se aprueba ni se rechaza solo** (`ai_auto_approve_hub_market` no se implementa en esta ronda). Precio fuera de rango, texto repetido y fotos repetidas los
  calcula SQL (`ai_hub_price_context()`, y consultas de la edge); la IA solo los explica. Un precio atípico sube el riesgo a "medio" aunque la IA diga "bajo".
- **La única acción automática: ocultar contenido de la comunidad.** Publicaciones del feed, comentarios y reseñas con riesgo "alto", confianza ≥ 0,9 y categoría en
  {spam, estafa, insultos_graves, sexual_explicito}, con `ai_auto_hide` encendido. **La regla vive en SQL** (`ai_save_moderation()`), no en la IA ni en la edge. Se marca
  `hidden_by_ai`: el público no lo ve, su autor sí ("En revisión") y los moderadores también. Nunca se borra nada. Una reseña oculta no cuenta en el promedio ni en
  `review_stats()`.
- **Restaurar** con un toque (`restore_hidden_content()`): queda anotado quién y la IA no lo vuelve a ocultar. Push a moderadores y admins cuando se oculta algo
  (`send-push` ganó el tipo `moderation`; **`send-push` va antes que la migración**).
- **Disparo.** Triggers + `pg_net` (los mismos tres secretos del Vault que la 0052) al crear una publicación, comentario o reseña, o una publicación de Hub Market pendiente (las de
  prueba no). Sin secretos no hace nada y no falla publicar.
- **Los videos del feed no se analizan** (no hay cuadro de portada: solo texto y fotos). De las fotos se bajan hasta 2 (feed) o 3 (Hub Market), y **solo de nuestro Storage**.
- **Orden de despliegue: la migración ANTES que el frontend.** El frontend nuevo pide `hidden_by_ai` en los `select` de comentarios y reseñas; sin la columna esas listas fallan.

## Búsqueda inteligente (bloque 5, migración 0054)

- **Es el buscador mejorado, no un chat.** `ai-parse-search` es **pública** (visitantes sin sesión): límite de 20 por minuto por IP (hash), apagada al 90 % del tope y a más del 30 % de gasto
  público, caché de 30 días por consulta normalizada y vehículo. Devuelve marca, modelo, año, categoría, términos, número de parte, intención y la frase corregida.
- **La IA nunca da ids.** Devuelve nombres; la edge los resuelve contra las listas reales (marcas, modelos de la marca detectada —por nombre, por alias como "chevy" o por el modelo
  que nombra la frase—, categorías) y descarta lo que no resuelve. Los `terms` se limpian a letras y números.
- **Heurística primero, IA después.** Un número de parte o un SKU no llama a la IA (ni la edge ni el front: `AiSearchService.shouldAsk()`). Solo se pregunta con pocos resultados (< 3), con un año en la
  frase, o con vehículo elegido y resultados mediocres. Cualquier fallo: la búsqueda de siempre, en silencio.
- **En `/buscar`:** chips "Entendí: Toyota Corolla 2015 · Luces" y "Buscar sin filtros" (`?ia=0`). Si lo refinado no trae nada, se queda la búsqueda normal y no hay chips. Con intención
  de servicio se sugiere `/servicios/cotizar`.
- **`search_log`** (sin datos personales: el texto se sanea en la base —`xah_clean_query()`— y no se guarda quién busca), freno global de 600 por minuto, retención de 90 días (cron).
  `admin_search_gaps()` y `ai_search_gaps()` dan las búsquedas SIN resultado (demanda perdida): alimentan el resumen diario (bloque 6) y las propuestas de alias.
- **`ai-match-models` (solo admin)**: "Proponer modelos" (los que la gente escribió a mano en su garaje → el modelo canónico que ya existe, o crear uno) y "Proponer alias" (búsquedas sin resultado
  → `product_aliases`). Un clic aplica: `admin_assign_vehicle_model()` (nueva en la 0054), `admin_create_vehicle_model()` (0040) o `addAlias`. Nada se aplica solo.
- **Orden de despliegue:** migración antes que el frontend (`log_search` y `admin_assign_vehicle_model` tienen que existir); el buscador sigue sirviendo si la edge no está.

## Cotización del taller con triage (bloque 7, migración 0055)

- **Arregla una limitación vieja**: `/servicios/cotizar` solo redactaba un texto de WhatsApp, no guardaba nada y las fotos no iban a ningún lado. Ahora guarda la solicitud (con o sin cuenta) con su
  código `XAH-C-0001` y sube las fotos de verdad (hasta 3, bajadas a 1600 px) a un bucket **privado** `quote-photos`. Al terminar se abre `wa.me` con el código en el mensaje (sin bot: la conversación sigue por
  WhatsApp). El nombre y un teléfono dominicano válido ahora son obligatorios.
- **`create_quote_request()`** es la única forma de crear una (abierta a visitantes): valida el teléfono (formato dominicano) y los largos en SQL, honeypot (un campo escondido: lleno ⇒ responde como si nada y no guarda),
  máximo 5 por hora por teléfono y 120 por hora en total, y que las fotos sean las que ese mismo visitante subió (carpeta `<uuid>/<0-2>.jpg|webp`, que él elige). RLS: el dueño ve las suyas, el admin todas; un admin solo
  cambia `status` y `handled_by`.
- **Triage** (`ai-triage-quote`, la llama un trigger con `pg_net`): servicios probables **de la tabla `services`** (nunca inventados), urgencia, un resumen de 2–3 líneas para el mecánico, qué falta preguntar, una lista de revisión
  **orientativa** y si se podría cotizar sin ver el vehículo. **Nunca da precios**: el "desde RD$…" sale de `services.price_from`. Con fotos usa Sonnet; sin ellas, Haiku. No se le manda el nombre ni el teléfono del cliente.
- **Seguridad, regla fija** (no un juicio de la IA): si la descripción habla de frenos, dirección o fuga de combustible, la urgencia es `seguridad` y al cliente se le muestra, al escribirlo y en la confirmación, la nota
  "Si sientes que no es seguro, no manejes el vehículo y avísanos." (`quote-safety.ts`, el mismo criterio en el front y en la edge).
- **Push a admins** por solicitud nueva (`send-push` ganó el tipo `quote_new`; **va antes que la migración**), que sale **aunque la IA no esté disponible**.
- **Panel:** pestaña **Solicitudes** en `/admin/taller`: filtros por estado, las de seguridad primero, fotos (enlaces firmados), el triage, "Responder por WhatsApp" (borrador con el código y lo que falta preguntar; plantilla sin IA, ver bloque 10)
  y "Enviar enlace para agendar" (con el servicio ya elegido), y el flujo de estados (nueva → vista → respondida → agendada → cerrada, o spam).
- **Purga:** las fotos de solicitudes cerradas o spam hace más de 90 días se borran. El cron llama a la edge, que usa la **API de Storage** (borrar filas de `storage.objects` por SQL deja el archivo huérfano) y solo después las quita de la
  fila. **Esto también cubre las fotos que subió un visitante y nunca llegó a enviar la solicitud: esas quedan huérfanas** (no hay forma de saber de quién son); pendiente una limpieza por antigüedad.
- **Voz: fuera de esta ronda** (la Permissions-Policy bloquea el micrófono y no hay clave de STT local). Punto de extensión: una edge `ai-transcribe` que reciba el audio y devuelva texto para el campo "¿qué le pasa?".
- **Orden de despliegue:** migración → edges (`ai-triage-quote`, `send-push`) → frontend. El frontend nuevo llama a `create_quote_request()`.

## Resumen diario (bloque 6, migración 0056)

- **Los números son de la base**, no de la IA: `business_metrics_compute()` (solo `service_role`; `business_daily_metrics()` es la versión para el panel, solo admin) da pedidos nuevos en 24 h, pagos con
  comprobante por revisar y pedidos sin comprobante > 24 h, vendido hoy (**solo pagado**, RD$, con la hora de confirmación del pago), stock bajo (ajuste `low_stock_threshold`, 3 por defecto) y agotados —con los
  agotados que la gente busca—, citas de hoy y mañana y sin confirmar, solicitudes de cotización sin responder > 24 h, moderación pendiente, publicaciones por vencer, reseñas nuevas, top de búsquedas
  sin resultado y el gasto de IA del mes.
- **La IA solo redacta** 5–8 líneas y ordena "lo primero que haría hoy" (máximo 3, cada una con un enlace a una ruta de /admin de una lista fija). **Guarda contra inventos:** si la redacción trae un número que no está en las
  métricas, se descarta y sale la plantilla. Si la IA falla, el tope está alcanzado o el interruptor está apagado, sale una **plantilla sin IA con los mismos números**. Los lunes se agrega la comparación contra la semana anterior
  (calculada en código, no por la IA).
- **Cuándo:** pg_cron a las 11:30 UTC (7:30 a. m. de RD) llama a la edge con el secreto compartido; un admin puede pedirlo ahora ("Generar ahora"). Un resumen por día (`ai_digests`, el de hoy se reemplaza). Push a admins
  solo cuando lo pide el reloj (`send-push` ganó el tipo `digest`, que solo avisa si el último resumen es de hace menos de 15 minutos; **`send-push` va antes que la migración**).
- **En el panel:** tarjeta "Hoy en el negocio" arriba de `/admin` (solo admin) con el resumen, de dónde salió (IA o plantilla) y el historial. Los enlaces solo van a rutas de /admin: cualquier otro enlace se pinta como texto.

## Reseñas, fichas y SEO (bloque 8, migración 0057)

**Resumen de reseñas.** `ai_review_summaries` (público de lectura: sale en la ficha). `ai_review_targets_due()` decide qué toca: **≥ 3 reseñas VERIFICADAS y visibles** y, si ya hay un resumen, **≥ 3 nuevas** desde que se escribió; las
ocultas por la moderación (0053) no cuentan, y tampoco las no verificadas. Cron nocturno a las 3:00 a. m. de RD (07:00 UTC) con un tope de 20 objetivos por corrida. Las reseñas llegan a la IA como dato y sin datos personales; el
resumen se rotula "Resumen generado con IA a partir de N reseñas verificadas" (con pros y contras). Si la IA no está, se corta y se reintenta mañana. Al guardar, el sitio se avisa **como mucho una vez al día**
(`ai_mark_site_dirty_daily()`, con la caché de IA de candado de 20 horas): sin tormentas de rebuild.

**SEO de fichas.** Columnas nuevas: `seo_title` (≤ 60), `seo_description` (≤ 155) y `seo_source` ('ia' | 'humano') en `hub_parts` y `services`; en `hub_parts` además `image_alts` y `seo_faq` (hasta 3 preguntas).
**Forma mínima del texto alterno** (la decisión que pedía el prompt): una columna `image_alts text[]` **paralela a `images`** (la posición i describe la foto i), no una tabla ni un jsonb; la galería lo usa por la dirección de cada foto
y, sin texto propio, cae al nombre del producto. Las preguntas frecuentes se ven como "Preguntas frecuentes" en la ficha (no hay JSON-LD `FAQPage` todavía). El panel no edita el texto alterno ni las preguntas a mano: solo la IA y la base.
- **La IA solo llena campos VACÍOS** (`ai_apply_product_seo()` / `ai_apply_service_seo()`, solo service_role): nunca pisa lo que escribió una persona. Un cambio desde el navegador pasa `seo_source` a 'humano' (un trigger; la IA avisa
  con un ajuste de transacción que ningún usuario puede poner por PostgREST). El panel tiene "Título/Descripción para buscadores" y "Sugerir SEO con IA" al editar una pieza.
- **Guarda contra inventos:** todo número de lo generado tiene que estar en la ficha, si no ese texto se descarta; las preguntas frecuentes solo salen con ≥ 2 especificaciones y sin afirmar garantías, envíos, medidas ni compatibilidades que no estén.
- `seo.service` usa el SEO escrito con el respaldo de siempre (el nombre y la descripción). Una columna `seo_*` solo llega a la ficha, no a las listas (mismo caso que `part_number`).
- **JSON-LD:** `mpn` sale del número de parte (bloque 2). El `aggregateRating` de un producto o servicio sale de `review_stats()`, que ahora **ignora las reseñas ocultas por la IA**; no mezcla estrellas sembradas.
- **Orden de despliegue:** migración → edges (`ai-review-summary`, `ai-seo-product`) → frontend (el `select` de la ficha y de los servicios pide las columnas `seo_*`).

## Garaje y mantenimiento (bloque 9, migración 0058)

- **Una guía por (marca, modelo, rango de años), cacheada para todos** (`vehicle_maintenance_templates`): la edge `ai-maintenance-template` (persona con sesión; el vehículo se lee **con su JWT**, así que solo uno suyo) no vuelve a llamar a la IA si ya hay una guía que
  cubra el año (`find_maintenance_template()`). Máximo 6 guías nuevas por hora por persona. **Solo intervalos y nombres de tareas**: un renglón con torques, capacidades, viscosidades, presiones o medidas se descarta; los intervalos tienen que ser razonables
  (1,000–200,000 km, 1–60 meses); mínimo 3 renglones buenos; el rango de años se acota a ≤ 12 y se extiende para incluir el año del vehículo. Los intervalos van ajustados a uso severo en RD (calor, tráfico, polvo). `category_slug` y `service_slug` se validan
  **en SQL** contra las tablas reales (`ai_save_maintenance_template()`): lo que no existe queda nulo.
- **Rotulado:** mientras ningún admin la revise, la persona ve "Guía general generada con IA; confírmala con el manual de tu carro o con el taller." En **/admin/taller/guias** ("Guías por revisar") un admin las marca como revisadas o las borra
  (la siguiente persona con ese vehículo dispara una nueva). Editar los renglones de una guía la marca como de un admin.
- **Lo del vehículo** (`vehicle_maintenance_items`): cada quien ve lo suyo (un admin todo). La **próxima vez y el estado los calcula siempre la base** (un trigger): vencido por fecha o por kilometraje, "pronto" a 30 días o 500 km, "al día". El dueño no escribe fechas
  ni estado directo: usa `adopt_maintenance_template()` (copia la guía una sola vez), `set_vehicle_odometer()`, `log_maintenance_done()` y `set_vehicle_reminders()`. Puede agregar y quitar renglones propios.
- **En Mi garaje**: botón "Mantenimiento" por vehículo → kilometraje, lo próximo a vencer, "Registrar servicio hecho", "Ver productos para esto" (deja elegido ese vehículo y abre la categoría de la tienda: **ojo, elegirlo lo vuelve el vehículo predeterminado del garaje**)
  y "Agendar" (con el servicio ya elegido). Hace falta que el modelo sea de la lista (no escrito a mano).
- **Recordatorios**: opcionales por vehículo y **apagados por defecto**. Cron a las 13:00 UTC (9:00 a. m. de RD) por el push que ya existe: **un aviso por vehículo**, y no más de uno cada 14 días por renglón. (`send-push` ganó `maintenance_reminder`, que vuelve a comprobar en la base que los
  recordatorios estén prendidos y haya algo por vencer; **va antes que la migración**.)
- **Autonomía mixta, reversible:** cuando una cita con vehículo y servicio pasa a "hecha" y coincide con **un solo** renglón (por `service_slug`), se registra como hecho con `source = 'taller'` y se avisa al cliente (`maintenance_logged`). Con dos renglones o ninguno,
  no se adivina: no se hace nada. El dueño puede volver a registrarlo.
- **Orden de despliegue:** migración → edges (`ai-maintenance-template`, `send-push`) → frontend (el garaje ahora pide `odometer_km` y `maintenance_reminders`).

## Mensajes de WhatsApp, sin bot (bloque 10)

**No hay bot ni API de Meta.** El 809-953-9782 sigue siendo un enlace `wa.me`, el token de WhatsApp de SGC no se usa (está atado a otro número) y **nada se manda solo**: la IA ayuda a redactar y quien atiende toca "enviar".
- **Del lado del cliente** (checkout por WhatsApp, cotizar, agendar): mensajes **determinísticos, sin IA** (una plantilla basta y no cuesta). El del pedido ahora lleva el número, el total, hasta 5 artículos y cómo lo recibe (`orderWhatsAppMessage()`); el de cotizar, el código de la
  solicitud, el vehículo y lo que escribió; el de agendar, el servicio, la hora y el vehículo.
- **Del lado del dueño** (`/admin/pedidos`, `/admin/taller/citas`, `/admin/taller/solicitudes`): "Responder por WhatsApp" abre un panel con un borrador que se puede editar, "Otra versión" (hasta 3 redacciones distintas) y "Abrir WhatsApp" (`wa.me/<teléfono del cliente>`).
  La edge `ai-draft-reply` (solo admin) recibe **contexto mínimo**: el primer nombre (como dato), el estado y los datos del caso (número, estado, hora de la cita, qué falta preguntar). **Nunca** el teléfono, el correo ni la dirección. El escenario
  sale del **estado en la base** (pago recibido, comprobante ilegible, listo para retiro, enviado…), no de lo que diga quien llama.
- **Guarda contra inventos:** un borrador con un enlace o con un número que no está en los datos del caso (montos, fechas) se descarta y el panel usa la **plantilla sin IA** (`reply-templates.ts`: `orderReplyDraft`, `appointmentReplyDraft`, `quoteReplyDraft`), que
  también es el texto con el que arranca el panel mientras la IA piensa. Si la IA no está, todo sigue funcionando con la plantilla.

## Google Maps (bloque 11, migración 0059)

**Ninguna clave de Google llega al navegador y la CSP no cambia.** Todo pasa por tres edges con la clave de **servidor** (`GOOGLE_MAPS_API_KEY`); el navegador solo ve las respuestas.

| Edge | Qué hace | Costo registrado |
| ---- | -------- | ---------------- |
| `maps-autocomplete` | Sugerencias de Places API (New), solo RD (`includedRegionCodes: ['do']`), en español, con token de sesión; mínimo 3 letras, caché de 1 día, límite 40/min por IP | `maps_autocomplete` ≈ US$0,00283 |
| `maps-geocode` | De `place_id`, texto o `lat/lng` a coordenadas y provincia/municipio/sector; solo RD (`components=country:DO`, `region=do`); fuera de RD responde `in_do: false`; caché de 30 días (la inversa redondeada a ~100 m); límite 20/min por IP | `maps_geocode` ≈ US$0,005 |
| `ai-normalize-address` | Haiku lee una dirección informal ("al lado del colmado Lalo, Pantoja"), la provincia **tiene que ser una de las 32**, y se geocodifica lo mejor posible. La confianza **nunca pasa de "media"** y **nunca bloquea un pedido** | Haiku + un geocode |

Las tres llaman a `gate(env, 'address', 'maps')`: respetan `ai_enabled`, el interruptor `ai_feature_address` y el tope propio de Maps (`maps_monthly_cap_usd`, US$10) **sin** el límite del 30 % de lo público (`ai_budget_status('maps')` no lo aplica: ese 30 % es de la IA). Todo fallo
responde `ia_no_disponible` y el formulario sigue a mano. Cada llamada a Google se anota en `ai_usage` con `maps_*`, y también las que fallan (con su `error_code`).

- **Checkout** (`/checkout`, paso 1): el campo "Dirección" sugiere con un retraso de 350 ms; al elegir una sugerencia se geocodifica, se completa la provincia (si es una de las 32) y el sector **solo si estaban vacíos**, y se avisa si cae fuera de RD. Al escribir se descarta el
  punto anterior. **Con el pedido ya creado** (`create_order()` no cambia de firma: la trampa del `PGRST203`) se anotan las coordenadas con `set_order_geo()`, sin esperar y sin avisar si falla; si la persona escribió a mano, la IA intenta entender la dirección informal en ese momento
  (una llamada por pedido, no por tecla). Un retiro en el taller no lleva coordenadas.
- **`set_order_geo(p_order_id, p_geo)`** (0059): abierta a `anon` y `authenticated` (el pedido de un invitado no tiene dueño; la llave es el uuid, como en `/pedido/:id`). Solo un pedido **con envío**, en `pending` o `awaiting_payment` y **sin coordenadas todavía**: una segunda llamada no reescribe.
  Descarta campos desconocidos y devuelve `false` ante cualquier problema (nunca lanza). `orders.shipping_geo` lo lee solo quien ya leía `orders` (dueño y admin).
- **`/admin/pedidos`**: "Abrir en Google Maps" es **solo un enlace** (`google.com/maps/search/?api=1&query=…`, sin API ni clave): exacto si hay coordenadas, y si no busca el texto de la dirección. Dice qué tan fiable es el punto.
- **`location-select`** (Leaflet + OpenStreetMap se queda): con el mapa abierto, el buscador acepta una dirección o un lugar y Enter, la busca con `maps-geocode` y **centra el mapa con un punto**. No elige nada: la provincia se sigue guardando al tocar el mapa, así el valor sale siempre de la lista.
- **Taller**: `site_settings.pickup_address` admite `lat`, `lng` y `place_id` (un check de la 0059 exige números válidos). En `/admin/ajustes` hay "Ubicar en el mapa" (geocodifica el texto) y "Quitar ubicación"; al cambiar la dirección se descarta el punto. `/servicios` y el footer muestran la dirección real
  (nunca la de ejemplo) con **"Cómo llegar"** (`google.com/maps/dir/?api=1&destination=…`). `/servicios` publica JSON-LD `AutoRepair` + `AutoPartsStore` con dirección, `geo` (solo si hay coordenadas) y `openingHoursSpecification` sacado de `service_availability`.
- **Orden de despliegue:** migración 0059 → edges → frontend (el panel de pedidos ahora lee `shipping_geo`).
- **No hay Distance Matrix ni costo de envío por distancia.** Nada de eso se hizo.

## Lo que se dejó fuera, a propósito

- **Geocodificación inversa al soltar el pin del mapa de `/publicar`.** La edge `maps-geocode` la soporta (`{ lat, lng }`), pero ni `location-select` ni el formulario de Hub Market tienen un campo de municipio en texto al que alimentar: el valor es una provincia de la lista. Queda
  lista la edge y el método `MapsService.reverse()` para cuando exista ese campo.

- **Voz.** `vercel.json` trae `Permissions-Policy: microphone=()` y no hay clave de STT local. El punto de extensión será una edge
  `ai-transcribe` (STT_PROVIDER/STT_API_KEY) y abrir el micrófono en esa política solo para las rutas que lo usen.
- **Videos del feed.** La IA no los analiza (no hay cuadro de portada, solo texto).
- **`ai_auto_approve_hub_market`.** No se implementa en esta ronda: Hub Market nunca se aprueba ni se rechaza solo.
- **Bot de WhatsApp.** No hay API de Meta; el 809-953-9782 sigue como enlace `wa.me` y el token de WhatsApp de SGC no se usa.

## Claves y secretos

Inventario hecho el 03/11/2026 leyendo **solo nombres** (`Deno.env.get(...)`) en `C:\dev\SGC\supabase\functions`; `C:\dev2\csd-app` no
guarda valores (`COMPA-API-KEY.md` solo explica cómo poner la clave de Anthropic).

| Secreto | ¿Sirve para X AutoHub? | Dónde vive hoy | Qué hacer |
| ------- | ---------------------- | -------------- | --------- |
| `ANTHROPIC_API_KEY` | **Sí** | Archivo local `C:\dev\SGC\ANTHROPIC_API_KEY.env` (solo el valor) y secreto del Supabase de SGC | Cargarlo como secreto de las edges de X AutoHub (ver abajo). Humo: Haiku 4.5 y Sonnet 5 responden 200 |
| `GOOGLE_MAPS_API_KEY` (servidor) | **Sí** | Archivo local `C:\dev\SGC\maps_platform_api_key.env` | Cargarlo igual. Humo: Geocoding, Places (New) autocompletar y Directions responden 200. La de navegador de SGC está restringida por referrer a su dominio y **no sirve aquí** |
| `STT_API_KEY` / `STT_PROVIDER` / `STT_MODEL` (Groq), `OPENAI_API_KEY` | Sí, pero no se puede leer de vuelta | Solo como secreto del Supabase de SGC | **Pendiente físico de Xaviel.** El código funciona sin ellos (la voz queda fuera) |
| `RESEND_API_KEY`, `VAPID_*`, `PUSH_WEBHOOK_SECRET`, `SITE_URL` | Ya los tiene X AutoHub | Secretos de las edges de X AutoHub | Nada |
| `VERCEL_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` | Ya los tiene X AutoHub | Secretos de las edges de X AutoHub | Nada |
| `WHATSAPP_*` (Meta) | **No**: atado al número de la constructora | SGC | No se usa |
| `FIREFLIES`, `ODOO_*`, `GOOGLE_SERVICE_ACCOUNT_JSON` (Workspace), `AGENTE_ESCRIBA_GITHUB_*`, FCM de SGC, Bóveda, `INFRA_SYNC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` de SGC | **No**: de la constructora o de otra cuenta | SGC | No se usan |

Secretos nuevos de configuración (sin valor sensible): `AI_MODEL_FAST=claude-haiku-4-5-20251001`, `AI_MODEL_SMART=claude-sonnet-5`, y
`AI_CRON_SECRET` (largo, nuevo: lo usa la base para llamar a las edges de IA por `pg_net`, y se mezcla en el hash de la IP).

> **Riesgo, sin sermón:** compartir las claves de SGC significa compartir **gasto, límites de uso y revocación** con SGC. Por eso esta
> ronda trae el tope mensual y los interruptores por función, y todo se lee por **nombre** de secreto: pasar a claves propias de
> X AutoHub es un solo `supabase secrets set`.

### Pasos manuales (nadie puede hacerlos por Xaviel desde aquí)

El CLI de Supabase no tiene sesión en esta máquina (`AccessTokenRequiredError`), así que **los secretos no se cargaron** y **las edges no se
desplegaron**. Con `<PROJECT_REF>` = `bzhokbcvfkipqimifrrq` (cuenta "Xaviel Dev"):

```bash
supabase login                                    # o: export SUPABASE_ACCESS_TOKEN=<TOKEN>

# Los valores salen de los archivos de SGC SIN imprimirlos. Archivo temporal FUERA del repo, que se borra al terminar:
TMP="$(mktemp)"
{
  printf 'ANTHROPIC_API_KEY=%s\n'   "$(cat /c/dev/SGC/ANTHROPIC_API_KEY.env)"
  printf 'GOOGLE_MAPS_API_KEY=%s\n' "$(cat /c/dev/SGC/maps_platform_api_key.env)"
  printf 'AI_MODEL_FAST=claude-haiku-4-5-20251001\n'
  printf 'AI_MODEL_SMART=claude-sonnet-5\n'
  printf 'AI_CRON_SECRET=%s\n'      "$(openssl rand -hex 32)"
} > "$TMP"
supabase secrets set --env-file "$TMP" --project-ref <PROJECT_REF>
rm -f "$TMP"
supabase secrets list --project-ref <PROJECT_REF>  # nombres, no valores

# Migraciones (en orden, de la 0050 a la 0059) y TODAS las edges nuevas, más send-push (que ahora trae tipos de aviso nuevos):
supabase db push --project-ref <PROJECT_REF>
for fn in send-push ai-product-ingest ai-verify-proof ai-moderate ai-parse-search ai-match-models ai-triage-quote ai-daily-digest \
          ai-review-summary ai-seo-product ai-maintenance-template ai-draft-reply maps-autocomplete maps-geocode ai-normalize-address; do
  supabase functions deploy "$fn" --project-ref <PROJECT_REF>
done
```

Y los secretos del **Vault** que usan los disparadores de la base (sin ellos no hace nada, y tampoco falla): `ai_functions_url` (la URL base de las funciones), `ai_cron_secret` (el mismo valor de `AI_CRON_SECRET`) y `send_push_anon_key`
(ya existía desde la 0028). Si se usa el flujo "migración por migración" en vez de `db push`, ojo con el **orden**: la 0050 va antes que todas, y la 0059 antes de desplegar el frontend.

`AI_CRON_SECRET` también hace falta como secreto del Vault de la base cuando lleguen los bloques que disparan edges desde Postgres
(`ai_cron_secret`, `ai_functions_url`: mismo patrón que `send_push_*` de la 0028).

Orden: **migración → edges → frontend** (la 0051 cambia `search_products()`; el frontend nuevo pide `part_number` y `cross_refs` en el `select`
de la ficha, y esas columnas tienen que existir antes).

## Verificación

```bash
node scripts/verify-ai-maps.mjs      # maps-autocomplete, maps-geocode y ai-normalize-address: solo RD, sin clave en la URL, caché, tope de Maps, provincia de las 32, nunca bloquea
node scripts/verify-ai-core.mjs      # _shared: JSON válido/roto, timeout, 429, tope, interruptores, inyección en <datos>, límite por IP, CORS, roles
node scripts/verify-ai-draft.mjs       # ai-draft-reply: sin teléfono ni dirección, escenario desde la base, sin enlaces ni montos inventados
node scripts/verify-ai-maintenance.mjs # ai-maintenance-template: solo vehículos propios, la guía en caché no se paga dos veces, sin torques ni capacidades
node scripts/verify-send-push-ai.mjs  # los tipos de aviso de la ronda: comprobante, moderación, cotización, resumen, mantenimiento
node scripts/verify-ai-reviews-seo.mjs # ai-review-summary y ai-seo-product: solo verificadas, números de la ficha, la edge no escribe (solo campos vacíos vía SQL)
node scripts/verify-ai-digest.mjs    # ai-daily-digest: números de la base, la IA no inventa, plantilla sin IA, lunes con comparación, aviso solo desde el reloj
node scripts/verify-ai-triage.mjs    # ai-triage-quote: servicios de la tabla, sin precios, seguridad por regla fija, aviso aunque falle la IA, purga con la API de Storage
node scripts/verify-ai-search.mjs    # ai-parse-search y ai-match-models: heurística, sin ids inventados, caché, límite por IP, tope, solo admin
node scripts/verify-ai-moderate.mjs  # ai-moderate: contenido como dato, la edge no oculta nada (lo decide SQL), precio atípico, solo Storage propio
node scripts/verify-ai-proof.mjs     # ai-verify-proof: solo anota, referencia solo en hash, veredicto de la base, aviso solo si coincide
node scripts/verify-ai-ingest.mjs    # ai-product-ingest: ids que la IA no puede inventar, precio solo si está impreso, duplicados, listas, caché, fallos
./scripts/verify-migrations.sh       # RLS de ai_*, tiers del tope, límite por ventana, número de parte y búsqueda, borradores, bucket
```

## Costos estimados (hipótesis, sin medir en producción)

Tarifas en `_shared/prices.ts` (Haiku 4.5: US$1 / US$5 por millón de tokens; Sonnet 5 asumido en US$3 / US$15: **confirmar**).

| Función | Estimado por uso | Nota |
| ------- | ---------------- | ---- |
| Catálogo (artículo de 4 fotos) | ~US$0,02–0,04 | lectura Sonnet ≈ 5–8 k tokens de entrada con imágenes + redacción Haiku |
| Agrupar 30 fotos | ~US$0,03 | Haiku con visión |
| Comprobante de transferencia | ~US$0,01 | una imagen con Sonnet; solo cuando se sube un comprobante |
| Moderación de un post, comentario o reseña | < US$0,001 | Haiku, solo texto (y una imagen cuando la hay) |
| Búsqueda en lenguaje natural | < US$0,001 | Haiku; un número de parte **no** la llama, y la caché de 30 días evita repetir |
| Triage de una cotización con fotos | ~US$0,005 | Haiku con hasta 3 imágenes |
| Resumen diario | ~US$0,01 | un solo llamado al día (Haiku), con los números de la base |
| Resumen de reseñas, SEO de ficha, guía de mantenimiento | ~US$0,002–0,01 | Haiku, una vez por ficha o por modelo (la guía queda en caché) |
| Borrador de un mensaje de WhatsApp | < US$0,001 | Haiku, contexto mínimo |
| Autocompletar de dirección (Places) | US$0,00283 por petición | con caché y token de sesión; ver el aviso de abajo |
| Geocodificar | US$0,005 por petición | caché de 30 días |
| Dirección informal (`ai-normalize-address`) | ~US$0,006 | Haiku + un geocode, **una vez por pedido** |

**Frente a los topes:** con el volumen de una tienda que empieza, la IA se queda muy por debajo de US$25 al mes (lo que más gasta es leer fotos de catálogo: ~US$10 con 300 artículos) y Maps muy por debajo de US$10 (US$10 son unas **1 700** búsquedas de autocompletar o
**2 000** geocodificaciones). El punto flojo de Maps es el autocompletar: cada tecla que pasa el retraso de 350 ms es una petición, y a **US$0,00283** unas 3 500 al mes ya son los US$10. Por eso hay caché de un día, mínimo de 3 letras, 40 por minuto por IP y el tope propio que apaga Maps
(el checkout sigue funcionando a mano). **Son hipótesis, no mediciones en producción**: se afinan con `/admin/ajustes → IA` cuando haya uso real.

## Notas de la versión (borrador, no cerrada)

La 2.31.0 **no está cerrada**: el bump de `package.json`/`package-lock.json`, el tag y la fila de `releases` se hacen cuando Xaviel pida cerrarla (la migración 0050–0059 y el despliegue de las edges tienen que ir antes). Borrador del `user_summary` para la tabla `releases`:
*"Ahora la búsqueda entiende tu carro y lo que escribes, puedes cotizar el taller con fotos, el garaje te recuerda el mantenimiento, y al pedir una entrega la dirección se completa sola."*
