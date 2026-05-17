# Operacion Git Y Deploy

Esta guia define el flujo obligatorio para cambios de codigo, validaciones en servidor y despliegues de `facturacion-electronica`.

## Regla Principal

Los cambios de codigo se hacen siempre en el repositorio local de trabajo, se commitean y se suben al remoto. El servidor solo consume commits ya publicados.

No se deben editar archivos versionados directamente en el servidor con `vim`, `nano`, `sed -i`, `git apply`, `cat >`, parches manuales, ni herramientas similares. Esto evita que `git pull` falle por cambios locales no commiteados en el checkout remoto.

## Flujo Obligatorio

1. Hacer cambios en el repo local:

```bash
git status --short
npm run build
npm test
```

2. Commit local:

```bash
git add <archivos>
git commit -m "fix: descripcion corta"
```

3. Push al repo remoto:

```bash
git push origin main
```

4. Recién después, desplegar en el servidor:

```bash
ssh -i ~/.ssh/id_ed25519 deploy@178.104.136.153
cd ~/apps/facturacion-electronica
git fetch
git pull --ff-only
bash scripts/deploy-prod.sh
```

5. Verificar salud:

```bash
docker compose -f docker-compose.prod.yml ps
curl -sS http://172.17.0.1:9988/fcws/health
```

## Uso De SSH Por Agentes

Cuando un agente ingrese por SSH al servidor, por defecto solo debe ejecutar verificaciones:

- `docker ps`
- `docker logs`
- `docker inspect`
- consultas `SELECT` en Postgres
- `curl` de healthchecks
- lectura de archivos de configuracion no sensibles

Un agente no debe modificar codigo, migraciones, tests, `package.json`, Dockerfiles ni archivos versionados dentro de `~/apps/facturacion-electronica` en el servidor.

## Excepcion Permitida: Datos Operativos

Se permiten cambios directos en base de datos o configuracion runtime solo cuando:

- el cambio es estrictamente operativo, por ejemplo corregir `IdCSC/CSC`, numeradores, estado de jobs o datos de emisor;
- el usuario lo autoriza explicitamente;
- se registra antes y despues con consultas SQL;
- no reemplaza un cambio de codigo que deberia ir por Git.

Ejemplo para correccion de CSC:

```sql
SELECT e.ruc_completo, c.ambiente, c.csc_id, length(c.csc_value) AS csc_len
FROM emisor_csc c
JOIN emisores e ON e.id = c.emisor_id
WHERE e.ruc_completo = '80136968-1'
  AND c.ambiente = 'test'
  AND c.activo = TRUE;
```

No imprimir secretos completos en logs o respuestas. Para CSC, certificados y passwords, mostrar solo longitud, estado, ambiente e identificadores.

## Validaciones Contra SET

Para validar una correccion contra SET/SIFEN:

1. El codigo debe estar commiteado, pusheado y desplegado.
2. La base debe tener los secretos operativos correctos.
3. Reenviar solo documentos elegibles y registrar:
   - numero de factura;
   - CDC resultante;
   - estado interno;
   - codigo SIFEN;
   - mensaje SIFEN;
   - `IdCSC` del QR, sin exponer el CSC.

Ejemplo de verificacion posterior:

```sql
SELECT numero,
       cdc,
       status,
       approved_at,
       substring(xml_qr FROM 'IdCSC=([^&<]+)') AS qr_idcsc,
       sifen_last_status #>> '{ns2:rRetEnviDe,ns2:rProtDe,ns2:gResProc,ns2:dCodRes}' AS code
FROM de_documents
WHERE numero IN ('0002094', '0002095', '0002096', '0002097')
ORDER BY numero;
```

## Si `git pull` Falla En El Servidor

Si el servidor muestra:

```text
error: Your local changes to the following files would be overwritten by merge
```

no seguir editando en el servidor.

Procedimiento:

1. Identificar los cambios:

```bash
cd ~/apps/facturacion-electronica
git status --short
git diff -- <archivo>
```

2. Confirmar que esos cambios ya existen en el repo local y fueron pusheados.
3. Si estan respaldados en Git remoto, limpiar el checkout remoto con autorizacion explicita:

```bash
git restore -- <archivo>
git pull --ff-only
```

4. Si hay archivos sensibles o runtime marcados como borrados/modificados, no restaurarlos sin revisar si son montajes o artefactos fuera del repo. Los certificados reales deben vivir fuera del arbol versionado, en `/opt/facturacion-electronica/runtime`.

## Incidente 2026-04-27: Hash QR Invalido

El rechazo `2501 - Hash de QR invalido` se produjo porque el servidor tenia una correccion aplicada directamente en el checkout remoto y la configuracion productiva tenia `IdCSC=0001` con CSC incorrecto. SET tenia `IdCSC=1`.

Reglas cerradas por este incidente:

- `IdCSC` no debe normalizarse con ceros a la izquierda; debe usarse exactamente como lo habilita SET.
- El CSC debe cargarse exactamente como lo entrega SET para el ambiente correspondiente.
- Todo fix de codigo debe pasar por commit local, push y deploy.
- Las validaciones por SSH no deben dejar cambios locales en `~/apps/facturacion-electronica`.
