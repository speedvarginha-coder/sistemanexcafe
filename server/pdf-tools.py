# -*- coding: utf-8 -*-
"""Ferramentas de PDF e Imagem para a fila de impressao do balcao.

Comandos:
  repair <entrada> <saida>                  conserta PDF com estrutura quebrada
  unlock <entrada> <saida> <senha>          abre PDF com senha do cliente e grava copia limpa
  grid <saida_pdf> <img1> [img2] [img3]...  junta de 1 a 4 imagens numa folha A4 em grade 9x13 cm
  rotate <imagem> [graus]                   gira imagem (padrao 90 graus horario)

Responde sempre uma linha JSON em stdout.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter


def respond(payload):
    print(json.dumps(payload, ensure_ascii=True))
    sys.exit(0)


def compose_grid(out_pdf, image_paths, dpi=300):
    if not image_paths:
        respond({"ok": False, "error": "Nenhuma imagem informada para a grade."})

    # A4 a 300 DPI (210 x 297 mm)
    page_w = int(round(8.2677 * dpi))
    page_h = int(round(11.6929 * dpi))

    page = Image.new("RGB", (page_w, page_h), (255, 255, 255))

    margin_x = int(round(0.59 * dpi))  # 15 mm (~177 px)
    margin_y = int(round(0.59 * dpi))
    gap_x = int(round(0.39 * dpi))     # 10 mm (~118 px)
    gap_y = int(round(0.39 * dpi))

    usable_w = page_w - 2 * margin_x
    usable_h = page_h - 2 * margin_y

    cell_w = (usable_w - gap_x) // 2
    cell_h = (usable_h - gap_y) // 2

    # 4 Quadrantes: 0=Topo-Esq, 1=Topo-Dir, 2=Base-Esq, 3=Base-Dir
    quadrants = [
        (margin_x, margin_y),
        (margin_x + cell_w + gap_x, margin_y),
        (margin_x, margin_y + cell_h + gap_y),
        (margin_x + cell_w + gap_x, margin_y + cell_h + gap_y),
    ]

    count = 0
    for idx, img_path in enumerate(image_paths[:4]):
        if not os.path.exists(img_path):
            continue
        try:
            with Image.open(img_path) as src:
                im = ImageOps.exif_transpose(src)
                if im.mode != "RGB":
                    im = im.convert("RGB")

                # Redimensiona proporcionalmente dentro da celula 9x13 sem distorcer e sem cortar
                im.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)

                qx, qy = quadrants[idx]
                offset_x = qx + (cell_w - im.width) // 2
                offset_y = qy + (cell_h - im.height) // 2

                page.paste(im, (offset_x, offset_y))
                count += 1
        except Exception as e:
            respond({"ok": False, "error": f"Erro ao ler imagem {os.path.basename(img_path)}: {e}"})

    if count == 0:
        respond({"ok": False, "error": "Nenhuma das imagens informadas pode ser lida."})

    os.makedirs(os.path.dirname(os.path.abspath(out_pdf)), exist_ok=True)
    page.save(out_pdf, "PDF", resolution=dpi)
    respond({"ok": True, "pages": 1, "imagesCount": count, "output": out_pdf})


def rotate_image(img_path, degrees=90):
    if not os.path.exists(img_path):
        respond({"ok": False, "error": f"Arquivo nao encontrado: {img_path}"})
    try:
        with Image.open(img_path) as src:
            im = ImageOps.exif_transpose(src)
            # Rotacao no sentido horario: 90 graus no sentido horario equivale a rotate(270) no PIL
            # ou Transpose.ROTATE_270
            deg = int(degrees) % 360
            if deg == 90:
                rotated = im.transpose(Image.Transpose.ROTATE_270)
            elif deg == 180:
                rotated = im.transpose(Image.Transpose.ROTATE_180)
            elif deg == 270:
                rotated = im.transpose(Image.Transpose.ROTATE_90)
            else:
                rotated = im

            fmt = src.format or "JPEG"
            rotated.save(img_path, format=fmt, quality=95)
            respond({"ok": True, "width": rotated.width, "height": rotated.height})
    except Exception as e:
        respond({"ok": False, "error": f"Erro ao girar imagem: {e}"})


def main():
    if len(sys.argv) < 3:
        respond({"ok": False, "error": "Comando invalido. Uso: pdf-tools.py <repair|unlock|grid|rotate> ..."})

    command = sys.argv[1].lower()

    if command == "grid":
        if len(sys.argv) < 4:
            respond({"ok": False, "error": "Uso: pdf-tools.py grid <saida_pdf> <img1> [img2] [img3] [img4]"})
        out_pdf = sys.argv[2]
        image_paths = sys.argv[3:]
        compose_grid(out_pdf, image_paths)

    elif command == "rotate":
        img_path = sys.argv[2]
        degrees = int(sys.argv[3]) if len(sys.argv) > 3 else 90
        rotate_image(img_path, degrees)

    elif command in ("repair", "unlock"):
        if len(sys.argv) < 4:
            respond({"ok": False, "error": "Uso: pdf-tools.py repair|unlock entrada saida [senha]"})
        path, out = sys.argv[2], sys.argv[3]
        password = sys.argv[4] if len(sys.argv) > 4 else ""
        try:
            reader = PdfReader(path)
            encrypted = bool(reader.is_encrypted)
            if command == "unlock" and not encrypted:
                respond({"ok": False, "encrypted": False, "error": "Este PDF nao tem senha."})
            if encrypted:
                if not password:
                    respond({"ok": False, "encrypted": True, "error": "Este PDF precisa de senha. Peca ao cliente (costuma ser CPF, telefone ou data de nascimento)."})
                if not reader.decrypt(password):
                    respond({"ok": False, "encrypted": True, "error": "Senha incorreta."})
            writer = PdfWriter()
            writer.append(reader)
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            with open(out, "wb") as target:
                writer.write(target)
            respond({"ok": True, "pages": len(reader.pages), "encrypted": encrypted})
        except SystemExit:
            raise
        except Exception as cause:
            respond({"ok": False, "encrypted": False, "error": f"{type(cause).__name__}: {cause}"})
    else:
        respond({"ok": False, "error": f"Comando desconhecido: {command}"})


if __name__ == "__main__":
    main()
