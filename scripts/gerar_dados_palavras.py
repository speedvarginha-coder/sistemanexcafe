"""Gera server/public/marketing/js/data_palavras.js a partir dos estudos de palavras-chave.

Fontes (pasta server/public/marketing/arquivos/palavras-chave):
- Speed_Financeira_Pesquisa_Palavras_Chave_Completa.xlsx, aba "Palavras-Chave Mestras":
  volume Brasil, MG e região, CPC, concorrência e prioridade (161 termos).
- estudo_palavras_chave_speed_financeiro_varginha.xlsx, aba "Matriz 50":
  faixa mensal do Keyword Planner com Varginha como local (11/09/2026), tendência e cauda.

Rodar de novo quando uma planilha mudar:  python scripts/gerar_dados_palavras.py
"""
import json
import os
import re
import unicodedata

import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "server", "public", "marketing", "arquivos", "palavras-chave")
SAIDA = os.path.join(RAIZ, "server", "public", "marketing", "js", "data_palavras.js")

GRUPOS = {  # nome da planilha -> produto no painel
    "Antecipação FGTS": "FGTS", "FGTS": "FGTS",
    "Consignado INSS": "INSS", "INSS": "INSS",
    "Consignado CLT": "CLT", "CLT": "CLT",
    "Financiamentos": "Veículos", "Financiamento": "Veículos",
    "Home Equity": "Garantia", "Garantia": "Garantia",
    "Regional": "Cidades da região", "Institucional": "Marca e loja",
}


def chave(texto):
    sem_acento = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


def reais(valor):
    if valor in (None, ""):
        return None
    numero = re.sub(r"[^\d,]", "", str(valor)).replace(",", ".")
    return float(numero) if numero else None


def linhas(arquivo, aba, cabecalho):
    planilha = openpyxl.load_workbook(os.path.join(PASTA, arquivo), read_only=True, data_only=True)[aba]
    todas = list(planilha.iter_rows(values_only=True))
    inicio = next(i for i, linha in enumerate(todas) if linha and linha[0] == cabecalho)
    nomes = todas[inicio]
    return [dict(zip(nomes, linha)) for linha in todas[inicio + 1:] if linha and linha[0]]


def produto(termo, grupo):
    # "Portabilidade/refin" é prioridade da loja e aparece misturado em INSS/CLT/Garantia na planilha.
    if re.search(r"portabilidade|refinanc|refin\b", chave(termo)) and grupo in ("INSS", "CLT"):
        return "Portabilidade e refin"
    return grupo


def cauda_por_palavras(termo):
    """Cauda pelo tamanho da frase: 1-2 palavras = curta, 3 = media, 4 ou mais = longa."""
    palavras = len(re.sub(r"[^\w\s]", " ", str(termo)).split())
    return "Cauda Curta" if palavras <= 2 else ("Cauda Média" if palavras == 3 else "Cauda Longa")


def main():
    termos = {}
    for linha in linhas("Speed_Financeira_Pesquisa_Palavras_Chave_Completa.xlsx", "Palavras-Chave Mestras", "Termo de Busca / Palavra-Chave"):
        termo = str(linha["Termo de Busca / Palavra-Chave"]).strip()
        grupo = GRUPOS.get(linha["Cluster / Serviço"], linha["Cluster / Serviço"])
        termos[chave(termo)] = {
            "termo": termo,
            "produto": produto(termo, grupo),
            "intencao": linha["Intenção de Busca"],
            "canal": linha["Canal Recomendado"],
            "brasil": linha["Volume Brasil (Mês)"],
            "mg": linha["Volume MG (Mês)"],
            "regiao": linha["Volume Varginha / Região"],
            "cpcMin": reais(linha["CPC Mínimo (R$)"]),
            "cpcMax": reais(linha["CPC Máximo (R$)"]),
            "concorrencia": linha["Concorrência Ads"],
            "prioridade": linha["Prioridade"],
        }
    for linha in linhas("estudo_palavras_chave_speed_financeiro_varginha.xlsx", "Matriz 50", "Palavra-chave"):
        termo = str(linha["Palavra-chave"]).strip()
        item = termos.setdefault(chave(termo), {
            "termo": termo,
            "produto": produto(termo, GRUPOS.get(linha["Cluster"], linha["Cluster"])),
            "intencao": str(linha["Intenção"]).capitalize(),
            "canal": linha["Alocação Principal"],
            "cpcMin": reais(linha["CPC mín."]),
            "cpcMax": reais(linha["CPC máx."]),
            "concorrencia": linha["Concorrência"],
        })
        item["faixaVarginha"] = str(linha["Volume mensal"]).replace("–", "a")
        item["cauda"] = linha["Tipo de Cauda"]
        tendencia = str(linha["Mud. YoY"] or "").strip()
        if tendencia and tendencia != "0%":
            item["tendencia"] = tendencia

    # Cauda que faltava (termos da planilha mestra, sem o tipo da Matriz 50):
    # classificados pelo tamanho da frase — 1-2 palavras = curta, 3 = media, 4 ou mais = longa.
    for item in termos.values():
        if not item.get("cauda"):
            item["cauda"] = cauda_por_palavras(item["termo"])

    lista = sorted(termos.values(), key=lambda t: (-(t.get("mg") or 0), t["termo"]))
    dados = {
        "fontes": {
            "volumes": "Speed_Financeira_Pesquisa_Palavras_Chave_Completa.xlsx (volume mensal Brasil, MG e região)",
            "planner": "Keyword Planner do Google Ads com Varginha como local, consultado em 11/09/2026 (faixa mensal)",
        },
        "termos": lista,
    }
    texto = json.dumps(dados, ensure_ascii=False, indent=1)
    with open(SAIDA, "w", encoding="utf-8", newline="\n") as arquivo:
        arquivo.write("// Gerado por scripts/gerar_dados_palavras.py a partir das planilhas de palavras-chave. Não editar à mão.\n")
        arquivo.write(f"window.SPEED_PALAVRAS = {texto};\n")
    print(f"{len(lista)} termos gravados em {SAIDA}")


if __name__ == "__main__":
    main()
