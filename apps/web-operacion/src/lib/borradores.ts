// Registro de documentos cargados y sin emitir (SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06, v0.2 RN-16). Movido de main.tsx
// sin cambios (URA-021): lo leen el dialogo de cambio de punto y el aviso bloqueante por cambio externo.
import { useEffect } from "react";

// RN-06: cada editor registra si tiene un documento cargado y sin emitir.
const _borradores = new Map<string, () => boolean>();

export function useBorradorSinEmitir(nombre: string, tieneDatos: () => boolean): void {
  useEffect(() => {
    _borradores.set(nombre, tieneDatos);
    return () => {
      if (_borradores.get(nombre) === tieneDatos) _borradores.delete(nombre);
    };
  });
}

export function hayBorradorSinEmitir(): boolean {
  for (const tieneDatos of _borradores.values()) {
    if (tieneDatos()) return true;
  }
  return false;
}
