const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseLine(line) {
  const raw = line.trim();
  if (!raw) {
    return { ok: false, reason: 'empty' };
  }

  const parts = raw.split('|');
  if (parts.length < 5) {
    return { ok: false, reason: 'format' };
  }

  const rucSinDv = normalizeText(parts[0]);
  const rawName = normalizeText(parts[1]);
  const dv = normalizeText(parts[2]);
  const codigoDnit = normalizeText(parts[3]) || null;
  const estado = normalizeText(parts[4]) || null;

  if (!rucSinDv || !dv || !rawName) {
    return { ok: false, reason: 'required' };
  }
  if (!/^\d{1,2}$/.test(dv)) {
    return { ok: false, reason: 'dv_invalid' };
  }
  if (rucSinDv.length > 20) {
    return { ok: false, reason: 'ruc_invalid' };
  }

  const normalizedIdentity = normalizeIdentity(rucSinDv, rawName);

  return {
    ok: true,
    value: {
      ruc_sin_dv: rucSinDv,
      dv,
      nombre: normalizedIdentity.nombre,
      apellido: normalizedIdentity.apellido,
      razon_social: normalizedIdentity.razon_social,
      codigo_dnit: codigoDnit,
      estado
    }
  };
}

function normalizeIdentity(rucSinDv, rawName) {
  const name = normalizeText(rawName);
  const isFisicaCandidate = /^\d+$/.test(rucSinDv) && rucSinDv.length <= 7;

  if (!isFisicaCandidate) {
    return {
      nombre: null,
      apellido: null,
      razon_social: name
    };
  }

  if (!name.includes(',')) {
    return {
      nombre: null,
      apellido: null,
      razon_social: name
    };
  }

  const [apellidoRaw, nombreRaw] = name.split(',', 2);
  const apellido = normalizeText(apellidoRaw);
  const nombre = normalizeText(nombreRaw);

  if (!apellido || !nombre) {
    return {
      nombre: null,
      apellido: null,
      razon_social: name
    };
  }

  return {
    nombre,
    apellido,
    razon_social: normalizeText(`${nombre} ${apellido}`)
  };
}

async function importTxtFiles(client, txtFiles, batchSize) {
  await client.query('truncate table dnit_ruc_contribuyentes_staging');

  const summary = {
    processedFiles: 0,
    parsedRows: 0,
    invalidLines: 0,
    insertedRows: 0
  };

  for (const txtFile of txtFiles) {
    const filename = path.basename(txtFile);
    const stream = fs.createReadStream(txtFile, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let batch = [];
    for await (const line of rl) {
      const parsed = parseLine(line);
      if (!parsed.ok) {
        if (parsed.reason !== 'empty') {
          summary.invalidLines += 1;
        }
        continue;
      }

      batch.push({ ...parsed.value, fuente_archivo: filename });
      summary.parsedRows += 1;

      if (batch.length >= batchSize) {
        const inserted = await insertBatch(client, batch);
        summary.insertedRows += inserted;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const inserted = await insertBatch(client, batch);
      summary.insertedRows += inserted;
    }

    summary.processedFiles += 1;
  }

  if (summary.insertedRows === 0) {
    throw new Error('No se insertaron registros en staging. Se cancela el refresh final.');
  }

  await client.query('begin');
  try {
    await client.query('truncate table dnit_ruc_contribuyentes');
    await client.query(`
      insert into dnit_ruc_contribuyentes (
        ruc_sin_dv,
        dv,
        nombre,
        apellido,
        razon_social,
        codigo_dnit,
        estado,
        fuente_archivo,
        fecha_importacion,
        created_at,
        updated_at
      )
      select
        ruc_sin_dv,
        dv,
        nombre,
        apellido,
        razon_social,
        codigo_dnit,
        estado,
        fuente_archivo,
        now(),
        now(),
        now()
      from dnit_ruc_contribuyentes_staging
    `);
    await client.query('truncate table dnit_ruc_contribuyentes_staging');
    await client.query('analyze dnit_ruc_contribuyentes');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  return summary;
}

async function insertBatch(client, rows) {
  await client.query('begin');
  try {
    const values = [];
    const params = [];

    rows.forEach((row, index) => {
      const offset = index * 8;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
      params.push(
        row.ruc_sin_dv,
        row.dv,
        row.nombre,
        row.apellido,
        row.razon_social,
        row.codigo_dnit,
        row.estado,
        row.fuente_archivo
      );
    });

    await client.query(
      `
      insert into dnit_ruc_contribuyentes_staging (
        ruc_sin_dv,
        dv,
        nombre,
        apellido,
        razon_social,
        codigo_dnit,
        estado,
        fuente_archivo
      )
      values ${values.join(',')}
      `,
      params
    );

    await client.query('commit');
    return rows.length;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

module.exports = {
  importTxtFiles,
  parseLine,
  normalizeIdentity
};
