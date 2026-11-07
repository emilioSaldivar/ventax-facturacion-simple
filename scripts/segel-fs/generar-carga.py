#!/usr/bin/env python3
"""Genera un CSV de carga masiva, formato 1 de FE (guia de consumidores, seccion 36.3).

Una factura contado por fila, con un solo item. No inventa datos: cliente, item y numeros los
indica quien lo corre. Los archivos con datos reales van fuera del repositorio.

  generar-carga.py --cantidad 20 --monto 1100 --punto 001-001 --numero-desde 1010000 \
    --receptor-documento 80000000-5 --receptor-nombre "EMPRESA S.A." --receptor-naturaleza JURIDICA \
    --item-descripcion "Servicio" --referencia ENSAYO-A --salida /ruta/privada/carga-a.csv

Con numeracion del servicio, FE asigna el numero fiscal y el del archivo queda como referencia.
"""
import argparse, csv, datetime, re, sys

COLUMNAS = [
    "tipo_documento", "numero_comprobante", "fecha_emision", "referencia_venta",
    "receptor_tipo_documento", "receptor_documento", "receptor_nombre", "receptor_naturaleza", "receptor_email",
    "condicion", "pago_1_medio", "pago_1_monto", "total_comprobante",
    "item_codigo", "item_descripcion", "item_cantidad", "item_precio_unitario", "item_iva",
]
PARAGUAY = datetime.timezone(datetime.timedelta(hours=-3))

p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
p.add_argument("--cantidad", type=int, required=True, help="Facturas del archivo")
p.add_argument("--monto", type=int, required=True, help="Total de cada factura en guaranies, IVA incluido")
p.add_argument("--punto", required=True, help="Establecimiento y punto: EEE-PPP")
p.add_argument("--numero-desde", type=int, required=True, help="Primer numero del archivo")
p.add_argument("--receptor-tipo", default="RUC")
p.add_argument("--receptor-documento", required=True)
p.add_argument("--receptor-nombre", required=True)
p.add_argument("--receptor-naturaleza", default="", choices=["", "FISICA", "JURIDICA"])
p.add_argument("--receptor-email", default="")
p.add_argument("--item-codigo", default="ITEM-1")
p.add_argument("--item-descripcion", required=True)
p.add_argument("--iva", default="IVA10", choices=["IVA10", "IVA5", "EXENTO"])
p.add_argument("--referencia", required=True, help="Prefijo de referencia_venta; hace unico al archivo")
p.add_argument("--invalidas", type=int, default=0, help="Ultimas N facturas con el total mal, para ver el informe")
p.add_argument("--salida", required=True)
a = p.parse_args()

errores = []
if not re.fullmatch(r"\d{3}-\d{3}", a.punto):
    errores.append("--punto debe ser EEE-PPP.")
if a.receptor_tipo == "RUC" and not a.receptor_naturaleza:
    errores.append("Con RUC hace falta --receptor-naturaleza.")
if a.receptor_tipo == "RUC" and not re.fullmatch(r"\d+-\d", a.receptor_documento):
    errores.append("Con RUC, --receptor-documento lleva numero, guion y digito verificador.")
if not 4 <= len(a.receptor_nombre) <= 255:
    errores.append("--receptor-nombre debe tener de 4 a 255 caracteres.")
if a.cantidad < 1 or a.monto < 1:
    errores.append("--cantidad y --monto deben ser mayores a 0.")
if not 0 <= a.invalidas <= a.cantidad:
    errores.append("--invalidas no puede superar a --cantidad.")
if a.numero_desde + a.cantidad - 1 > 9999999:
    errores.append("Los numeros superan los 7 digitos.")
if errores:
    sys.exit("\n".join(errores))

# Un minuto atras: una fecha adelantada al reloj de SIFEN no aporta nada a la prueba.
fecha = (datetime.datetime.now(PARAGUAY) - datetime.timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%S")
with open(a.salida, "w", newline="", encoding="utf-8") as archivo:
    escritor = csv.DictWriter(archivo, fieldnames=COLUMNAS, delimiter=";", lineterminator="\r\n")
    escritor.writeheader()
    for i in range(a.cantidad):
        invalida = i >= a.cantidad - a.invalidas
        escritor.writerow({
            "tipo_documento": "FACTURA",
            "numero_comprobante": f"{a.punto}-{a.numero_desde + i:07d}",
            "fecha_emision": fecha,
            "referencia_venta": f"{a.referencia}-{i + 1:04d}",
            "receptor_tipo_documento": a.receptor_tipo,
            "receptor_documento": a.receptor_documento,
            "receptor_nombre": a.receptor_nombre,
            "receptor_naturaleza": a.receptor_naturaleza,
            "receptor_email": a.receptor_email,
            "condicion": "CONTADO",
            "pago_1_medio": "EFECTIVO",
            "pago_1_monto": a.monto,
            "total_comprobante": a.monto + 1 if invalida else a.monto,
            "item_codigo": a.item_codigo,
            "item_descripcion": a.item_descripcion,
            "item_cantidad": 1,
            "item_precio_unitario": a.monto,
            "item_iva": a.iva,
        })
validas = a.cantidad - a.invalidas
print(f"{a.salida}: {a.cantidad} facturas, {validas} validas, total valido {validas * a.monto} Gs, numeros {a.numero_desde} a {a.numero_desde + a.cantidad - 1}")
