# TASKS Refinamiento Usabilidad Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/PLAN_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| RUX-001 | SDD | Crear cadena SPEC/PLAN/TASKS de refinamiento de usabilidad | DONE | Existen documentos versionados para alcance de guardado opcional, salto a envio y limpieza post compartir |
| RUX-002 | UI nueva factura | Agregar decision guardar/no guardar item en catalogo | DONE | El operador puede confirmar item con `guardar` o `no guardar` sin romper carga de factura |
| RUX-003 | UI/catalogo | Aplicar persistencia condicional de item | DONE | `Guardar` persiste en catalogo; `No guardar` agrega solo a factura actual |
| RUX-004 | UI navegacion | Implementar salto directo a bloque `Envio de documentos` tras confirmar item | DONE | El operador no requiere scroll manual adicional para continuar flujo |
| RUX-005 | UI estado | Limpiar formulario `Nueva factura` luego de compartir con exito | DONE | Cliente, items y totales quedan reiniciados y el menu queda listo para nueva factura |
| RUX-006 | QA visual/E2E | Validar flujo mobile y desktop/tablet contra contenedores | PENDING_VALIDATION | Playwright confirma guardado opcional, salto directo a envio y reset post compartir |
| RUX-007 | Cierre documental | Registrar evidencia en TASKS de implementacion MVP | DONE | `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` contiene comandos, fecha y resultado de validaciones |
| RUX-008 | UX copy | Traducir readiness tecnico a lenguaje de negocio en `Informacion` | DONE | La UI usa `Membresia activa`, `Suscripcion al dia`, `Facturador activo`, `Configuracion fiscal completa` y evita terminos tecnicos para cliente final |
| RUX-009 | UX arquitectura | Separar vista cliente final y diagnostico tecnico de backoffice | DONE | Cliente final no ve `tenant/backend` ni detalles internos; soporte conserva diagnostico tecnico por canal interno |
| RUX-010 | UX accionable | Mostrar estado general y acciones claras cuando falten requisitos | DONE | `Listo para facturar` o `Faltan requisitos para facturar` con mensajes de accion concretos y no tecnicos |
| RUX-011 | QA visual Informacion | Validar pantalla `Informacion` mobile y desktop/tablet | PENDING_VALIDATION | Playwright verifica textos no tecnicos, estado general visible y ausencia de labels tecnicos en vista cliente |
| RUX-012 | Cierre documental UX | Registrar evidencia de refinamiento de `Informacion` | DONE | Evidencia de comandos, capturas y resultados queda en esta matriz y en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` |
| RUX-013 | UI cabecera factura | Ocultar por defecto datos de cabecera fiscal en `Nueva factura` | DONE | Facturador/RUC/Est.-Punto/Fecha/Timbrado/Siguiente estimado se muestran solo al activar icono de ojo |
| RUX-014 | UI copy cabecera | Eliminar nota de numero fiscal pendiente en `Nueva factura` | DONE | No se renderiza el texto `Numero fiscal pendiente de emision...` en ningun viewport |
| RUX-015 | QA cabecera factura | Validar toggle de ojo y ausencia de nota en mobile y desktop/tablet | PENDING_VALIDATION | Playwright confirma estado colapsado inicial, toggle funcional y nota eliminada |
| RUX-016 | UI cliente | Cambiar placeholder de documento a `Ingrese numero de documento` | DONE | El input de documento muestra placeholder neutro sin ejemplo fijo confuso |
| RUX-017 | UI cliente | Aplicar teclado contextual por tipo de documento | DONE | `RUC` y `CI` usan teclado numerico en mobile; otros tipos mantienen entrada alfanumerica |
| RUX-018 | UI cliente | Destacar obligatorios y marcar opcionales | DONE | `Documento` y `Nombre o razon social` se distinguen como obligatorios; `Correo`, `Telefono`, `Direccion` quedan como opcionales |
| RUX-019 | UI producto | Reordenar modal: `Cantidad` primero y foco inicial en `Descripcion` | DONE | El primer bloque visible es `Cantidad` y al abrir modal el cursor queda en `Descripcion` |
| RUX-020 | UI producto | Definir placeholder de `Descripcion` (fijo o rotativo) | DONE | Placeholder implementado como `Ingrese descripcion` o rotacion controlada de ejemplos de negocio |
| RUX-021 | UI mobile | Corregir corte del modal por teclado en `+ Agregar producto` | DONE | Modal mantiene visible cabecera + descripcion + accion principal en mobile con teclado abierto sin scroll manual forzado |
| RUX-022 | UI IVA | Reemplazar `Opciones avanzadas` por `+ Agregar codigo` / `+ Codigo interno` | DONE | Label usa lenguaje de negocio y despliega campo de codigo interno opcional |
| RUX-023 | UI IVA | Implementar selector tactil de IVA `5%/10%/EX` con default `10%` | DONE | IVA se selecciona con un toque en chips visibles y `10%` queda preseleccionado |
| RUX-024 | QA nueva factura | Validar formulario cliente + modal producto + IVA en mobile/desktop | PENDING_VALIDATION | Playwright cubre placeholder, teclado por documento, jerarquia obligatorio/opcional, modal estable con teclado y seleccion IVA tactil |
| RUX-025 | Cierre documental iteracion | Registrar evidencia de esta iteracion UX en TASKS | DONE | Evidencia completa queda en esta matriz y en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` |
| RUX-026 | UI producto | Reordenar modal a `Descripcion` y luego fila `Cantidad + Precio` | DONE | Modal presenta `Descripcion` en primer bloque y `Cantidad`/`Precio` en la fila siguiente sin romper flujo de carga |
| RUX-027 | UI mobile | Bloquear zoom del navegador en la app operativa | DONE | El viewport define `maximum-scale=1.0` y `user-scalable=no` para evitar zoom manual en pantallas operativas |
| RUX-028 | UI mobile | Reforzar despliegue del popup con teclado (scroll superior y alto visible) | DONE | Al abrir `+ Agregar producto` la vista sube al inicio util y el modal no se corta con teclado en mobile |
| RUX-029 | UI readiness | Unificar check operativo de integracion fiscal para facturador | DONE | El check final queda en verde solo cuando contexto fiscal local + backend fiscal estan listos para operar con `facturacion-electronica` |

## Evidencia

- 2026-05-23: definida iniciativa `REFINAMIENTO_USABILIDAD_EMISION` con cadena SDD completa para resolver feedback de usuario final sobre carga de items, continuidad a envio y limpieza post compartir. Sin implementacion de codigo en esta tarea documental.
- 2026-05-23: ampliado alcance UX para `Informacion/Readiness` con foco en lenguaje no tecnico para cliente final en Paraguay: mapeo de terminos tecnicos a terminos de negocio, separacion de audiencia cliente/backoffice y tareas RUX-008 a RUX-012 en estado `PENDING`.
- 2026-05-23: ampliado alcance UX de `Nueva factura` para cabecera fiscal colapsable por icono de ojo y eliminacion de la nota de `Numero fiscal pendiente...`; se agregan tareas RUX-013 a RUX-015 en estado `PENDING`.
- 2026-05-23: incorporado refinamiento UX de formulario cliente y modal de producto: placeholder de documento no ambiguo, teclado numerico condicional para `RUC`/`CI`, jerarquia obligatorios/opcionales, correccion de modal con teclado mobile, selector IVA tactil `5%/10%/EX` y accion `+ Agregar codigo` para codigo interno; se agregan tareas RUX-016 a RUX-025 en estado `PENDING`.
- 2026-05-24: implementados refinamientos RUX-002 a RUX-005 y RUX-008 a RUX-023 en `apps/web-operacion`: decision guardar/no guardar item, persistencia condicional, salto al bloque de envio tras confirmar linea, reset operativo post-resultado, copy no tecnico en `Informacion`, cabecera fiscal colapsable por icono de ojo, placeholder `Ingrese numero de documento`, teclado numerico para `RUC`/`CI`, obligatorios y opcionales diferenciados, modal de producto con `Cantidad` primero y foco en `Descripcion`, placeholder `Ingrese descripcion`, reemplazo de `Opciones avanzadas` por `+ Agregar codigo interno` y selector IVA tactil `IVA 5%/10%/EX` con default `10%`.
- 2026-05-24: validacion tecnica local ejecutada: `npm run typecheck --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run test --workspace @facturacion-simple/api`, `npm run build --workspace @facturacion-simple/web-operacion`, `npm run qa:no-secrets`, `APP_ENV_FILE=/tmp/.env.testing FE_DOCKER_NETWORK=fe_local bash scripts/deploy.sh`, healthchecks `curl -sS http://127.0.0.1:8092/healthz` y `curl -sS http://127.0.0.1:8092/api/v1/health`.
- 2026-05-24: `RUX-006`, `RUX-011`, `RUX-015` y `RUX-024` quedan `PENDING_VALIDATION` por falta de ejecucion Playwright local en este entorno (modulo `playwright` no disponible en runtime actual), aunque la implementacion y validaciones de compilacion/tests/smoke local quedaron exitosas.
- 2026-05-24: implementado ajuste adicional del modal de producto en `apps/web-operacion`: orden final `Descripcion` -> fila `Cantidad + Precio`, eliminacion del toggle intermedio `No guardar/Guardar en catalogo` en favor de botones finales `AGREGAR Y GUARDAR` y `AGREGAR Y NO GUARDAR`, edicion directa de descripcion/precio aun cuando el item proviene de catalogo, y bloqueo de zoom en app operativa via viewport. Validacion local: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-24: corregido descalce de readiness en `Informacion y estado` para evitar falso bloqueo visual: el check operativo ahora consume `fiscal_context_local` (con fallback legado `contexto_fiscal_local_completo`) y se consolida como `Integracion con facturacion-electronica lista para operar` solo cuando contexto fiscal local y `fiscal_backend_ready` estan en `ok=true`. Si falla contexto, muestra falta de datos fiscales; si falla backend fiscal, muestra indisponibilidad de conexion fiscal. Validacion local: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.
