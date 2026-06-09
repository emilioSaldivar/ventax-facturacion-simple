# Uso Permitido y Restricciones

**Proyecto:** Ventax Facturacion Simple Cliente  
**Version del documento:** 0.1  
**Fecha:** 2026-06-09  
**Estado:** borrador operativo para revision legal

## 1. Alcance y base observada

Este documento analiza el repositorio como software comercial protegido y define criterios minimos de uso permitido, restricciones y riesgos. No sustituye un contrato ni revision juridica.

La base observada en el repositorio es:

- `package.json` declara el paquete como `private: true` y no se detecto archivo `LICENSE`, `COPYING` ni `NOTICE`.
- `README.md` define una aplicacion web SaaS para emitir facturas electronicas simples consumiendo `facturacion-electronica`.
- `AGENTS.md` y `docs/SPEC_PRODUCTO_MVP_v0.1.md` delimitan el producto como SaaS multi-facturador de Ventax y separan la responsabilidad fiscal del backend `facturacion-electronica`.
- `apps/api`, `apps/web-operacion`, `apps/backoffice`, `packages/shared`, `db/migrations`, `scripts`, `infra` y `dnit-ruc-loader` contienen codigo, despliegue, migraciones, operacion y utilidades.
- `ventax_logos/` y `apps/web-operacion/public/brand/` contienen assets oficiales de marca Ventax.
- `docker-compose.yml`, `infra/docker/*`, `infra/nginx-or-caddy/*` y `scripts/deploy.sh` muestran que el sistema esta preparado para despliegue containerizado en servidor controlado.
- `.gitignore`, `scripts/check-no-secrets.cjs`, `.env*.example` y la documentacion operativa indican que `.env`, API keys, passwords, certificados, backups y datos descargados no deben versionarse.

Cuando este documento dice "Ventax", se refiere al titular comercial y operativo identificado por el nombre del producto, dominios, assets de marca y backend fiscal Ventax detectados en el repositorio.

## 2. Que puede hacer un cliente con este software

Un cliente habilitado puede:

- Usar la aplicacion operativa publicada por Ventax, principalmente bajo `/app/`, con usuarios autorizados.
- Emitir facturas electronicas y notas de credito dentro del alcance documentado: Paraguay, SIFEN, factura contado, factura credito simple y nota de credito.
- Gestionar su agenda de clientes comerciales por facturador.
- Gestionar su catalogo propio de productos o servicios por facturador.
- Consultar documentos emitidos, estados operativos, PDF/KUDE, XML y links publicos disponibles.
- Compartir comprobantes por enlace, WhatsApp o email delegado cuando el flujo este habilitado.
- Solicitar alta, configuracion, soporte, reset de password y correcciones operativas segun los roles y procesos habilitados por Ventax.
- Usar el servicio solo para sus tenants, facturadores, usuarios, establecimientos, puntos de expedicion, actividades y documentos autorizados.

## 3. Que no puede hacer un cliente

Un cliente no puede:

- Copiar, descargar, vender, sublicenciar, publicar, entregar o redistribuir el codigo fuente del repositorio.
- Instalar el stack en servidores propios o de terceros sin contrato especifico de instalacion, operacion o licencia.
- Acceder al backoffice interno (`/backoffice/`) salvo que Ventax le asigne formalmente un rol interno autorizado.
- Usar credenciales, sesiones, API keys o links de otro tenant, usuario, facturador o ambiente.
- Intentar acceder a `tenant_id`, `facturador_id`, clientes, catalogos, facturas, snapshots, links publicos o datos fiscales que no le pertenecen.
- Manipular numeracion fiscal, XML, firma, QR, CSC, certificados, SIFEN o artefactos fiscales fuera de los flujos controlados por Ventax y `facturacion-electronica`.
- Eludir validaciones de tenant, suscripcion, usuario, rol, facturador, readiness o permisos.
- Usar scraping, automatizacion no autorizada o ingenieria inversa sobre la UI, API, tokens, endpoints o contratos internos.
- Remover, ocultar, reemplazar o usar indebidamente la marca Ventax.
- Almacenar o compartir passwords, API keys, certificados, CSC, `.env`, backups o tokens en medios inseguros.
- Usar el servicio para prestar una plataforma equivalente a terceros, reventa blanca o marca blanca sin contrato.

## 4. Que puede hacer un integrador autorizado

Un integrador autorizado puede:

- Integrar sistemas externos como POS, ERP, ecommerce o sistemas de venta solo mediante contratos HTTP documentados y credenciales entregadas para ese fin.
- Usar API keys de consumidor asignadas, con los permisos, emisores y ambientes autorizados.
- Probar en ambiente `test` o sandbox cuando exista credencial habilitada.
- Implementar idempotencia, conciliacion, consulta de documentos y entrega de artefactos usando los contratos documentados.
- Configurar variables de entorno, dominios, Nginx/Caddy, Docker Compose y despliegues solo cuando el contrato le otorgue ese alcance.
- Ejecutar validaciones operativas autorizadas, por ejemplo healthchecks, smoke tests y pruebas de integracion contra ambientes acordados.
- Reportar errores con `requestId`, `cdc`, `document_uuid`, numero fiscal, ambiente y evidencia tecnica sin exponer secretos.

## 5. Que no puede hacer un integrador

Un integrador no puede:

- Usar API keys globales, de otro facturador, de otro ambiente o con permisos superiores a los asignados.
- Instalar `apps/api`, `apps/web-operacion`, `apps/backoffice`, `db/migrations`, `dnit-ruc-loader`, Dockerfiles o scripts de despliegue fuera de infraestructura autorizada por Ventax.
- Copiar contratos, colecciones Postman, scripts SQL, modelos de datos o logica del producto para crear un servicio competidor.
- Exponer API keys en codigo fuente, repositorios, logs, tickets, URLs, chats o documentacion.
- Acceder al backoffice interno, a la base PostgreSQL o a contenedores salvo alcance contractual expreso.
- Modificar numeracion fiscal, certificados, CSC, firma, XML, QR, envio SIFEN o artefactos fiscales fuera de `facturacion-electronica`.
- Alterar reglas de tenant, facturador, permisos, readiness, idempotencia o aislamiento de datos.
- Reutilizar assets Ventax, estilos, pantallas, textos, flujos o componentes para productos propios.
- Entregar acceso a terceros no aprobados por Ventax.

## 6. Que puede hacer un aliado comercial

Un aliado comercial puede:

- Presentar el servicio Ventax a potenciales clientes, con materiales aprobados por Ventax.
- Referir clientes, coordinar altas comerciales y acompanar onboarding no tecnico.
- Recibir informacion comercial necesaria para la venta, siempre limitada al cliente y oportunidad autorizados.
- Solicitar demos, fichas comerciales o ambientes de prueba aprobados por Ventax.
- Canalizar requerimientos, incidentes y solicitudes de soporte hacia Ventax.
- Usar la marca Ventax solo en los terminos autorizados por Ventax.

## 7. Que no puede hacer un aliado comercial

Un aliado comercial no puede:

- Presentarse como propietario del software, del backend fiscal, de la marca o de la infraestructura Ventax.
- Revender el software como producto propio, marca blanca o servicio equivalente sin contrato especifico.
- Prometer funcionalidades fuera de las documentadas, por ejemplo caja, inventario, POS completo, offline, balanza, cuentas corrientes o gestion fiscal directa no cubierta.
- Acceder a codigo fuente, base de datos, `.env`, API keys, certificados, CSC, backups, contenedores o backoffice.
- Crear usuarios, facturadores, tenants o configuraciones tecnicas si no tiene autorizacion operativa expresa.
- Copiar logos, pantallas, nombres, manuales, contratos, documentacion tecnica o flujos para otro producto.
- Compartir informacion de clientes, leads o datos operativos con terceros no autorizados.

## 8. Partes de propiedad exclusiva de Ventax

Deben tratarse como propiedad exclusiva de Ventax, salvo componentes de terceros y datos del cliente indicados mas abajo:

- Codigo fuente de `apps/api`, `apps/web-operacion`, `apps/backoffice` y `packages/shared`.
- Arquitectura SaaS, aislamiento por `tenant_id` y `facturador_id`, flujos de emision, outbox, entrega publica, backoffice y readiness.
- Migraciones, esquema de base de datos, seeds, repositorios, servicios, validaciones y contratos propios del SaaS.
- Documentacion SDD en `docs/`, `AGENTS.md`, `spec/openapi.yaml`, guias operativas y colecciones Postman incluidas.
- Scripts de deploy, backup, restore, smoke, onboarding, SQL operativo y verificacion de secretos.
- Configuracion de infraestructura en `docker-compose.yml`, `infra/docker/*` e `infra/nginx-or-caddy/*`.
- UI, estilos, layout, textos operativos, PWA, componentes y experiencia de usuario de Ventax.
- Logos y assets de marca en `ventax_logos/` y `apps/web-operacion/public/brand/`.
- Integracion server-to-server con `facturacion-electronica`, incluyendo adaptadores, contratos, mapeos y manejo de errores.
- Know-how operativo reflejado en documentacion de alta, produccion, soporte, integracion fiscal y estabilizacion.

No se debe interpretar que este repositorio otorga derechos sobre dependencias de terceros de npm, Docker, PostgreSQL, Nginx u otros componentes externos. Esos componentes quedan sujetos a sus propias licencias.

## 9. Datos que pertenecen al cliente

Deben tratarse como datos del cliente, del facturador o de sus receptores, segun corresponda:

- Datos del tenant: nombre, slug, estado y suscripcion asociada.
- Usuarios del cliente: username, email, display name, roles asignados, estado, bloqueos y registros de login.
- Facturador: RUC, razon social, nombre fantasia, emisor fiscal asociado y configuracion operativa.
- Establecimientos, puntos de expedicion, actividades economicas, perfiles de emision, timbrado, inicio de timbrado y numeracion operativa configurada.
- Agenda comercial del facturador: documentos, nombres/razones sociales, direcciones, telefonos, emails y relacion comercial con receptores.
- Catalogo del facturador: codigos, descripciones, precios, IVA, estado y auditoria de creacion/edicion.
- Facturas y notas operativas: snapshots de cliente, items, totales, usuario emisor, estado, fechas, CDC, numero fiscal, `document_uuid`, `fiscal_document_id`, respuestas fiscales resumidas y errores.
- Links publicos de documentos y tokens opacos generados para compartir comprobantes.
- Audit events, login attempts, refresh tokens, backups PostgreSQL y logs que contengan datos operativos del cliente.
- Credenciales entregadas al cliente o a su integrador: passwords temporales, API keys de consumidor, tokens y secretos de acceso.

La base global de identidades de clientes y la tabla `dnit_ruc_contribuyentes` se observan como infraestructura interna de autocompletado y normalizacion. No deben exponerse como "agenda compartida" del cliente ni usarse para mezclar relaciones comerciales entre facturadores.

## 10. Componentes que no deben instalarse en servidores de terceros sin contrato

No deben instalarse, copiarse ni operarse en servidores de terceros sin contrato expreso:

- Stack completo `docker-compose.yml`.
- API SaaS: `apps/api` e imagen derivada de `infra/docker/api.Dockerfile`.
- Frontends `apps/web-operacion` y `apps/backoffice`, e imagen derivada de `infra/docker/frontend.Dockerfile`.
- Libreria compartida `packages/shared`.
- Base PostgreSQL con migraciones `db/migrations`, seeds y datos operativos.
- Servicio `dnit-ruc-loader` y sus datos descargados/importados.
- Scripts de operacion en `scripts/`, incluyendo deploy, backups, restore, smoke tests, onboarding y SQL de backoffice.
- Configuraciones de host en `infra/nginx-or-caddy/*`, especialmente las que contienen dominios Ventax y rutas de certificados.
- Archivos de entorno `.env`, `.env.staging`, `.env.production`, backups, logs, fixtures locales y datos en `.local/`.
- Documentacion de integracion fiscal, OpenAPI, Postman y procedimientos de API keys cuando el tercero no este autorizado.
- Assets de marca Ventax.

El backend `facturacion-electronica` no forma parte instalable de este repositorio; aqui se consume como API externa. Cualquier acceso, API key o instalacion de ese backend requiere acuerdo separado.

## 11. Riesgos si se entrega el codigo fuente

La entrega del codigo fuente aumenta estos riesgos:

- Clonacion del SaaS, reventa no autorizada o creacion de un producto competidor usando la arquitectura, UI, flujos y documentacion.
- Exposicion de rutas, contratos, endpoints, modelos de datos, nombres de tablas, reglas de negocio y mecanismos de aislamiento multi-tenant.
- Exposicion de detalles de despliegue, puertos, dominios, healthchecks, Nginx, Docker, redes y convenciones operativas.
- Exposicion de la estrategia de integracion con `facturacion-electronica`, incluyendo idempotencia, outbox, `document_uuid`, estados, artefactos y errores.
- Uso indebido de scripts SQL, scripts de alta, reset de usuarios, backup/restore o smoke tests contra ambientes reales.
- Riesgo de manejo inseguro de secretos si quien recibe el codigo copia `.env`, API keys, passwords, certificados o fixtures locales junto con el repositorio.
- Aumento de superficie para ataques por conocimiento interno de roles, endpoints de backoffice, reset de password, links publicos y validaciones.
- Confusion sobre titularidad de datos: el codigo no es dato del cliente, pero los backups, logs y bases desplegadas si pueden contener datos del cliente.
- Uso no autorizado de logos y marca Ventax.
- Dificultad de auditar modificaciones si un tercero instala variantes fuera del control de Ventax.
- Incumplimiento de SDD y de validaciones obligatorias si se modifica el producto sin seguir `SPEC -> PLAN -> TASKS -> IMPLEMENT`.

## 12. Clausulas minimas recomendadas para contrato

Estas clausulas son una guia minima basada en el repositorio. Deben ser ajustadas por asesoria legal.

### 12.1 Licencia de uso

El contrato debe aclarar que el cliente recibe un derecho limitado, no exclusivo, no transferible y revocable para usar el servicio Ventax en los ambientes, usuarios, tenants, facturadores y funcionalidades contratadas. No debe implicar transferencia de codigo fuente, propiedad intelectual, marca, infraestructura ni know-how.

### 12.2 Confidencialidad

El contrato debe proteger codigo fuente, documentacion tecnica, contratos HTTP, scripts, credenciales, API keys, configuracion, procedimientos de soporte, datos operativos, precios, materiales comerciales no publicos y cualquier informacion recibida por acceso al servicio.

### 12.3 Prohibicion de reventa

El contrato debe prohibir revender, sublicenciar, alquilar, prestar, ofrecer como marca blanca, empaquetar o explotar comercialmente el software o acceso al servicio sin autorizacion escrita de Ventax.

### 12.4 Prohibicion de copia

El contrato debe prohibir copiar, reproducir, publicar, distribuir, descargar, clonar o entregar codigo fuente, binarios, contenedores, configuraciones, documentacion, assets, logos, scripts o contratos tecnicos salvo lo estrictamente autorizado.

### 12.5 Prohibicion de ingenieria inversa

El contrato debe prohibir descompilar, desensamblar, inspeccionar trafico con fines de replica, extraer modelos de datos, reconstruir APIs, evadir controles, auditar seguridad sin permiso, automatizar endpoints no documentados o derivar productos equivalentes desde el servicio.

### 12.6 Limitacion de responsabilidad

El contrato debe delimitar responsabilidad por caidas, errores de terceros, SIFEN, DNIT, conectividad, infraestructura del cliente, credenciales comprometidas, configuraciones incorrectas, uso fuera de alcance, datos cargados por el cliente y fallas del backend fiscal externo cuando correspondan.

### 12.7 Proteccion de marca

El contrato debe indicar que Ventax, sus logos, isotipos, nombres, dominios, estilos, pantallas y materiales son de uso restringido. El cliente, integrador o aliado solo puede usarlos con autorizacion, sin alterarlos, registrarlos, confundir origen comercial ni presentarse como titular.

### 12.8 Proteccion de datos

El contrato debe definir responsabilidades sobre datos del cliente, datos de receptores, facturas, catalogo, credenciales, backups, logs, links publicos y datos fiscales. Tambien debe exigir medidas minimas: acceso por roles, secreto de credenciales, no compartir API keys, canales seguros, eliminacion o devolucion de datos al terminar, y notificacion de incidentes.

### 12.9 Suspension por incumplimiento

El contrato debe permitir suspender acceso, usuarios, API keys, integraciones, facturadores, tenants o ambientes cuando exista incumplimiento, riesgo de seguridad, uso indebido, no pago, exposicion de secretos, intento de copia, acceso no autorizado o afectacion a Ventax, SIFEN, otros clientes o terceros.

### 12.10 Terminacion del servicio

El contrato debe regular terminacion por vencimiento, no pago, incumplimiento, uso no autorizado, violacion de propiedad intelectual, exposicion de datos o decision comercial. Debe definir efectos: cese de acceso, revocacion de credenciales, tratamiento de datos, backups, retencion, entrega de informacion permitida y prohibicion de seguir usando software, marca o documentacion.

## 13. Regla operativa final

Salvo autorizacion escrita y contrato especifico, el acceso permitido para clientes, integradores y aliados debe limitarse al uso del servicio publicado, APIs documentadas, credenciales asignadas y datos propios. El codigo fuente, infraestructura, scripts, marca, documentacion tecnica interna y configuracion de despliegue deben permanecer bajo control de Ventax.
