// RN-36 (SPEC_IMPORT_CONFIG_FACTURADOR_v0.3 §1.4): en los PATCH del backoffice, un campo ausente
// del cuerpo no se modifica. El repositorio decide con `"campo" in input`, asi que el service no
// debe mandar la clave cuando no vino. Antes de la correccion, `{ activo: false }` borraba textos.

import { describe, expect, it } from "vitest";
import {
  updateActividad,
  updateBackofficeUser,
  updateEstablecimiento,
  updateFacturador,
  updatePerfil,
  updatePunto
} from "../src/modules/backoffice/backoffice.service";
import type { BackofficeRepository } from "../src/modules/backoffice/backoffice.types";

const ID = "11111111-1111-4111-8111-111111111111";

/** Repositorio que solo registra lo que recibe cada update y devuelve una fila cualquiera. */
function repositorioEspia() {
  const recibido: Record<string, Record<string, unknown>> = {};
  const repo = new Proxy({} as BackofficeRepository, {
    get: (_t, metodo: string) => async (_id: string, input: Record<string, unknown>) => {
      recibido[metodo] = input;
      return { id: ID };
    }
  });
  return { repo, recibido };
}

const casos: Array<{
  entidad: string;
  metodo: string;
  campos: string[];
  llamar: (repo: BackofficeRepository, input: Record<string, unknown>) => Promise<unknown>;
}> = [
  { entidad: "facturador", metodo: "updateFacturador", campos: ["nombre_fantasia"], llamar: (r, i) => updateFacturador(ID, i, r) },
  { entidad: "establecimiento", metodo: "updateEstablecimiento", campos: ["direccion"], llamar: (r, i) => updateEstablecimiento(ID, i, r) },
  { entidad: "punto", metodo: "updatePunto", campos: ["nombre"], llamar: (r, i) => updatePunto(ID, i, r) },
  { entidad: "actividad", metodo: "updateActividad", campos: ["descripcion", "alias_operativo"], llamar: (r, i) => updateActividad(ID, i, r) },
  { entidad: "perfil", metodo: "updatePerfil", campos: ["descripcion"], llamar: (r, i) => updatePerfil(ID, i, r) },
  { entidad: "usuario", metodo: "updateUser", campos: ["display_name"], llamar: (r, i) => updateBackofficeUser(ID, i, r) }
];

describe("PATCH parcial del backoffice (RN-36)", () => {
  for (const caso of casos) {
    it(`${caso.entidad}: { activo: false } no manda ${caso.campos.join(" ni ")}`, async () => {
      const { repo, recibido } = repositorioEspia();
      await caso.llamar(repo, { activo: false });
      for (const campo of caso.campos) expect(campo in recibido[caso.metodo]!).toBe(false);
    });

    it(`${caso.entidad}: un null explicito si llega como null`, async () => {
      const { repo, recibido } = repositorioEspia();
      await caso.llamar(repo, Object.fromEntries(caso.campos.map((c) => [c, null])));
      for (const campo of caso.campos) {
        expect(campo in recibido[caso.metodo]!).toBe(true);
        expect(recibido[caso.metodo]![campo]).toBeNull();
      }
    });
  }
});
