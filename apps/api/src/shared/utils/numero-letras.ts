export function numeroALetras(n: number): string {
  if (n === 0) return "CERO GUARANIES";

  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const especiales = [
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
    "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  ];
  const decenas = [
    "", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
    "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
  ];
  const centenas = [
    "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
  ];

  function menorMil(num: number): string {
    if (num === 0) return "";
    if (num < 10) return unidades[num] as string;
    if (num < 20) return especiales[num - 10] as string;
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      return (decenas[d] as string) + (u > 0 ? " Y " + (unidades[u] as string) : "");
    }
    if (num === 100) return "CIEN";
    const c = Math.floor(num / 100);
    const resto = num % 100;
    return (centenas[c] as string) + (resto > 0 ? " " + menorMil(resto) : "");
  }

  function convertir(num: number): string {
    if (num === 0) return "";
    if (num < 1000) return menorMil(num);
    if (num < 1_000_000) {
      const miles = Math.floor(num / 1000);
      const resto = num % 1000;
      const prefijo = miles === 1 ? "MIL" : menorMil(miles) + " MIL";
      return prefijo + (resto > 0 ? " " + menorMil(resto) : "");
    }
    if (num < 1_000_000_000) {
      const millones = Math.floor(num / 1_000_000);
      const resto = num % 1_000_000;
      const prefijo = millones === 1 ? "UN MILLON" : menorMil(millones) + " MILLONES";
      return prefijo + (resto > 0 ? " " + convertir(resto) : "");
    }
    const billones = Math.floor(num / 1_000_000_000);
    const resto = num % 1_000_000_000;
    const prefijo = billones === 1 ? "MIL MILLONES" : menorMil(billones) + " MIL MILLONES";
    return prefijo + (resto > 0 ? " " + convertir(resto) : "");
  }

  return convertir(Math.floor(n)) + " GUARANIES";
}
