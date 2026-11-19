# -*- coding: utf-8 -*-
"""Ferramentas de PDF e Imagem para a fila de impressao do balcao.

Comandos:
  repair <entrada> <saida>                  conserta PDF com estrutura quebrada
  unlock <entrada> <saida> <senha>          abre PDF com senha do cliente e grava copia limpa
  grid <saida_pdf> <img1> [img2] [img3]...  junta de 1 a 4 imagens numa folha A4 em grade 9x13 cm
  rotate <imagem> [graus]                   gira imagem (padrao 90 graus horario)
  nup <entrada> <saida> [por_folha]         junta 2 paginas por folha A4 paisagem (padrao 2)

Responde sempre uma linha JSON em stdout.
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter, Transformation


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


def compose_nup(src_pdf, out_pdf, per_sheet=2):
    # 2 paginas por folha A4 paisagem: 28 paginas viram 14 folhas, cobradas como 14.
    if int(per_sheet) != 2:
        respond({"ok": False, "error": "So 2 paginas por folha por enquanto."})
    if not os.path.exists(src_pdf):
        respond({"ok": False, "error": f"Arquivo nao encontrado: {src_pdf}"})
    try:
        reader = PdfReader(src_pdf)
        if reader.is_encrypted:
            respond({"ok": False, "encrypted": True, "error": "PDF protegido por senha: informe a senha do cliente na impressao comum."})
        total = len(reader.pages)
        if total < 1:
            respond({"ok": False, "error": "O documento nao tem paginas."})
        # A4 paisagem em pontos (1/72 pol).
        out_w, out_h = 842, 595
        margem = 7  # meio centimetro de respiro entre as duas paginas
        writer = PdfWriter()
        sheets = 0
        for i in range(0, total, 2):
            dest = writer.add_blank_page(width=out_w, height=out_h)
            for j in range(2):
                if i + j >= total:
                    break
                page = reader.pages[i + j]
                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)
                # Cada pagina ocupa metade da folha, sem cortar e sem esticar.
                scale = min((out_w / 2 - margem) / pw, (out_h - margem) / ph)
                tx = j * out_w / 2 + (out_w / 2 - pw * scale) / 2
                ty = (out_h - ph * scale) / 2
                dest.merge_transformed_page(page, Transformation().scale(scale, scale).translate(tx, ty))
            sheets += 1
        os.makedirs(os.path.dirname(os.path.abspath(out_pdf)), exist_ok=True)
        with open(out_pdf, "wb") as target:
            writer.write(target)
        respond({"ok": True, "pages": total, "sheets": sheets, "output": out_pdf})
    except SystemExit:
        raise
    except Exception as e:
        respond({"ok": False, "error": f"Erro ao montar 2 por folha: {e}"})


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

    elif command == "nup":
        if len(sys.argv) < 4:
            respond({"ok": False, "error": "Uso: pdf-tools.py nup <entrada_pdf> <saida_pdf> [por_folha]"})
        per_sheet = int(sys.argv[4]) if len(sys.argv) > 4 else 2
        compose_nup(sys.argv[2], sys.argv[3], per_sheet)

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
