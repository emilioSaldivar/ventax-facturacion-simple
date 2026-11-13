# SPEC — Dirección del cliente en la factura (hotfix) v0.1

**Fecha:** 2026-11-13 · **Rama:** `feat/identidad-segel` · **Backlog:** FS-152 (crítica), FS-154 (alta), FS-155 (alta, mitigación) · **Relacionado:** FS-153 (plantillas del KuDE, lo hace FE en `segel-rc4.37`)

## 1. Problema

Todos los clientes piden que la dirección del comprador salga en la factura. Hoy no sale ni en el XML ni en el KuDE (caso SALUMAX `001-002-0016511`, FUNDACION TESAI: la agenda tiene "Cerro leon c/ alejo garcia" y el KuDE dice "Dirección:" vacío).

**Causa verificada (2026-11-13, FS y FE `segel-rc4.36` a8dd889):** FS manda solo `receptor.direccion` (`fiscal-gateway.client.ts`, `buildReceptor`). FE descarta la dirección si llega sola (`fe.mapper.ts:181`, `factura.schema.ts:292`), porque el MT150 la condiciona: si se informa D213 `dDirRec`, son obligatorios D218 número de casa, D219 departamento y D223 ciudad (SIFEN 1330, 1324, 1327; coherencia 1328). Con B2F solo el número.

## 2. Reglas de SIFEN y FE (confirmadas por FE, `facturacion-electronica-da`)

- La dirección es **opcional**. Si va, va **completa**: calle (1 a 255), número de casa (1 a 6 dígitos, `0` si no tiene), departamento y ciudad con los códigos de `GET /v1/parametrizaciones/geografia`; el distrito es opcional (FE lo deduce de la ciudad).
- FE valida todo eso con `422` **antes de numerar**, también en la carga por planilla. No se completan valores por defecto: sería declarar un domicilio inventado.
- **No** se imprime una dirección en el KuDE que no esté en el XML: el campo J003 (información adicional del emisor) no sirve para datos de la operación, y el KuDE debe coincidir con el DTE (MT150 13.4.5, 13.5 y línea 907). Decisión: se envía completa o no se envía.
- Caracteres (XSD v150, UTF-8): se admite cualquier carácter salvo saltos de línea; rompen el documento los caracteres de control, los saltos de línea (xmlgen los borra sin espacio) y los campos solo con espacios.
- Hueco de FE (FS-155): 58 ciudades del catálogo tienen descripción de más de 30 caracteres y SIFEN admite 30 (`tDesCiudad`); pasarían el `422` y se rechazarían después de numerar. FE lo corrige en su cadena.

## 3. Alcance

**Entra (FS):**
1. La agenda guarda el domicilio del cliente: número de casa, departamento, distrito y ciudad, además de la calle.
2. Nueva factura pide y muestra esos datos en "Dirección, teléfono y correo (opcionales)" y los envía a FE cuando el domicilio está completo.
3. Regla de caracteres para las direcciones (FS-154).
4. Mitigación de FS-155: el selector de ciudad no ofrece ciudades con descripción de más de 30 caracteres (factura y remisión).

**No entra:** plantillas del KuDE (FS-153, FE `segel-rc4.37`); presupuestos y pedidos (no van a FE); la carga por planilla (el contrato es de FE: ya admite `receptor_numero_casa` y demás columnas); nota de crédito (FE toma el receptor de la factura asociada); producción (el despliegue se autoriza aparte).

## 4. Reglas de negocio

- **RN-01 — Domicilio completo o nada.** Se envía a FE el domicilio solo si hay calle, número de casa, departamento y ciudad. Si falta alguno, no se envía ninguno de esos datos (como hoy) y la factura se emite igual.
- **RN-02 — Sección opcional, cerrada por defecto.** La dirección no es obligatoria. En Nueva factura y en el editor de la agenda va en una sección propia, cerrada al abrir la pantalla, con el botón "Agregar dirección". Si el cliente elegido de la agenda ya tiene domicilio guardado, la sección se abre mostrándolo, para que el operador vea qué se envía, y ofrece "Quitar dirección" (no se envía en esa factura). Con la sección abierta y el domicilio incompleto se muestra "Completá calle, número, departamento y ciudad para que la dirección salga en la factura."; "Crear factura" no se bloquea y la factura sale sin dirección. Decisiones del usuario del 2026-11-13.
- **RN-03 — Número de casa.** De 1 a 6 dígitos; `0` si no tiene (la pantalla lo sugiere). Misma regla que la remisión (`validarNumeroCasa`).
- **RN-04 — Códigos del MT150 en listas.** Departamento y ciudad se eligen de listas desplegables, nunca se escriben: primero el departamento (lista de departamentos) y después la ciudad, que muestra solo las ciudades de ese departamento, en orden alfabético. Cambiar el departamento vacía la ciudad. Los códigos y descripciones son los de las tablas geográficas del MT150, tal como los publica FE en `GET /v1/parametrizaciones/geografia` (FE las toma de la librería que escribe el XML, así que coinciden con SIFEN). El distrito no se pide: se toma de la ciudad elegida (FE lo deduce igual). El número de casa se escribe (RN-03).
- **RN-05 — Agenda.** El domicilio se guarda en la agenda del facturador con "Guardar/Actualizar en la agenda al emitir" y desde Agenda / Clientes. Los clientes ya cargados conservan su calle y quedan con el domicilio incompleto hasta que alguien lo complete.
- **RN-06 — Caracteres (FS-154, decisión del usuario: la regla de FE).** En las direcciones (cliente; en la remisión: locales, transportista y chofer):
  - se permiten letras con o sin tilde, ñ, dígitos, espacio y `. , / - º ª ° # ( ) ' " &`;
  - los saltos de línea y tabulaciones se reemplazan por un espacio, las comillas tipográficas (‘ ’ “ ”) pasan a `'` y `"`, los espacios repetidos se juntan y se recortan los extremos;
  - cualquier otro carácter (emojis, caracteres de control, símbolos fuera de la lista) se rechaza con el mensaje "La dirección tiene caracteres no permitidos: <caracteres>. Usá letras, números y . , / - º # ( ) ' \" &";
  - máximo 255 caracteres; un campo que queda vacío después de limpiar se trata como sin dirección.
  La misma regla se aplica en la pantalla y en la API.
- **RN-07 — Ciudades largas (FS-155).** Las listas de ciudades que entrega la API de FS excluyen las de descripción de más de 30 caracteres, hasta que FE publique la corrección.
- **RN-08 — Snapshot y ficha.** La factura guarda el domicilio en `cliente_snapshot`. La ficha muestra la dirección (calle, Nº, ciudad y departamento). Si el domicilio estaba incompleto, la dirección no fue a SIFEN ni sale en el KuDE, y la ficha lo aclara debajo: "No sale en la factura: falta número, departamento y ciudad." (decisión del usuario del 2026-11-13, hallazgo de la verificación de la factura 1010683).

## 5. Criterios de aceptación

- **CA-01:** con un cliente con domicilio completo, la factura sale en SIFEN test con `dDirRec`, `dNumCasRec`, `cDepRec` y `cCiuRec` en el XML, y el KuDE imprime la calle (con `segel-rc4.37`, también número, ciudad y departamento).
- **CA-02:** con un cliente que solo tiene la calle, la factura se emite (sin domicilio en el XML) y la pantalla muestra el aviso de RN-02.
- **CA-03:** "Cerro leon c/ alejo garcia", "Avda. Mcal. López Nº 1234 (esq. Brasil) - Dpto. 3/B" y "Ruta 2 Km 30 #45" se aceptan; un emoji o un carácter de control se rechazan con el mensaje de RN-06, en pantalla y en la API; un salto de línea queda como espacio.
- **CA-04b:** la sección de dirección está cerrada al abrir Nueva factura; "Agregar dirección" la abre; elegir "CENTRAL" muestra en Ciudad solo ciudades de Central (por ejemplo "LUQUE", no "ENCARNACION"); cambiar el departamento vacía la ciudad; un cliente de la agenda con domicilio abre la sección con sus datos.
- **CA-04:** completar el domicilio en Nueva factura con "Actualizar en la agenda al emitir" lo deja guardado en la agenda; Agenda / Clientes lo edita.
- **CA-05:** el selector de ciudad no ofrece "COLONIA SAN ALFREDO - MARIA AUXILIADORA" (6531) ni otras de más de 30 caracteres, en la factura y en la remisión.
- **CA-06:** la remisión y la carga por planilla siguen funcionando igual (regresión).
- **CA-07:** Playwright en 1440, 1280 y 390 px; pruebas de API; `spec/openapi.yaml` actualizado.

## 6. Decisiones

| Id | Decisión | Estado |
|---|---|---|
| D-1 | Domicilio incompleto: no se envía y se avisa, sin bloquear | Decidida (usuario, 2026-11-13) |
| D-2 | Caracteres: la regla recomendada por FE (RN-06) | Decidida (usuario, 2026-11-13) |
| D-3 | No usar J003 para imprimir una dirección que no va en el XML | Decidida (recomendación de FE aceptada por el usuario al elegir enviar completo, 2026-11-13) |
| D-5 | Listas departamento → ciudad (sin distrito visible) con los códigos del MT150; sección de dirección opcional y cerrada por defecto | Decidida (usuario, 2026-11-13) |
| D-6 | Ficha con dirección incompleta: se muestra con la aclaración de que no sale en la factura | Decidida (usuario, 2026-11-13) |
| D-4 | Las plantillas del KuDE las corrige FE (`segel-rc4.37`); FS prueba con esa versión cuando esté | Orden del usuario a FE, 2026-11-13 |
