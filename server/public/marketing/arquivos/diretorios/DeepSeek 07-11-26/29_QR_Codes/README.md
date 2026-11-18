# 29 — QR codes de WhatsApp

**Gerado em:** 07/11/2026
**Fonte:** `dados/nap.json` + `dados/links_whatsapp.txt`
**Gerador:** `ferramentas/gerar_qr.py` (segno 1.6.6)

> Nada aqui foi publicado. Os arquivos são para impressão local e uso no balcão.

---

## O que tem na pasta

| Arquivo | Conteúdo | Onde usar |
|---|---|---|
| `qr_01_grafica.png/.svg` | Conversa com código `[GRAF]` | Cartaz da gráfica, vitrine, orçamento |
| `qr_02_consignado.png/.svg` | Conversa com código `[CONS]` | Balcão financeiro, folder de consignado |
| `qr_03_digitais.png/.svg` | Conversa com código `[DIG]` | Balcão de documentos, página de serviços digitais |
| `qr_04_perfil.png/.svg` | Conversa com código `[PERFIL]` | Material que cita o Google |
| `qr_05_geral.png/.svg` | Conversa com código `[GERAL]` | Cartaz de porta, atendimento geral |
| `qr_06_site.png/.svg` | `https://speedfinanceira.com.br` | Material institucional |
| `cartoes_A6.html` | 4 cartões A6 + 1 cartaz A5, prontos para imprimir | Balcão e porta |
| `README.md` | Este arquivo | Consulta interna |

**Formato:** PNG com 16 px por módulo e margem de 4 módulos; SVG para impressão em qualquer tamanho sem perder qualidade. Cor verde `#016b3b` sobre branco para manter contraste alto.

---

## Como testar antes de imprimir

1. Abra `cartoes_A6.html` no navegador.
2. Aponte a câmera do celular para cada QR na tela.
3. Confirme que a conversa abre no WhatsApp **com o texto e o código certo**.
4. Só então imprima.

Teste já feito na geração: os 6 PNGs foram lidos com `cv2.QRCodeDetector` e decodificaram exatamente a URL esperada.

```powershell
python -c "import cv2, glob, os; d=cv2.QRCodeDetector(); [print(os.path.basename(p), '->', d.detectAndDecode(cv2.imread(p))[0]) for p in sorted(glob.glob('29_QR_Codes/*.png'))]"
```

---

## Como imprimir os cartões

| Item | Configuração |
|---|---|
| Papel | A4 (para os cartões) e A5 (para o cartaz, se a impressora permitir) |
| Escala | **100%** — não usar "ajustar à página" |
| Cor | Colorida (o verde e o amarelo são parte da marca) |
| Frente/verso | Só frente |
| Corte | Nas linhas tracejadas dos cartões |

Se a impressora não tiver A5, imprima o cartaz em A4 e corte na marca.

---

## Regras de uso

- O QR **não substitui** o telefone escrito. Quem não usa câmera precisa ler o número.
- Não colar QR em local com sol direto ou reflexo: a leitura falha.
- Não alterar a cor do QR para amarelo ou foto. Contraste baixo quebra a leitura.
- Cada QR tem um código de origem. Se a pessoa apagar o texto antes de enviar, a origem se perde — por isso o cartão pede para **enviar a mensagem pronta**.
- O QR de avaliação do Google **não está nesta pasta** porque o link `g.page/r/...` ainda não foi informado pelo dono (ver `03_Decisoes_Pendentes.md` e `08_Perfil_Google_e_Avaliacoes.md`).

---

## Como regerar

```powershell
python ferramentas\gerar_qr.py
```

O script lê o telefone e o site de `dados/nap.json` e os links de `dados/links_whatsapp.txt`. Se o telefone mudar, os QR mudam junto — sem editar imagem à mão.

---

## Pendências

| Pendência | Efeito |
|---|---|
| Link `g.page/r/...` de avaliação | Falta o QR de avaliação e o cartão "avalie a Speed" |
| Horário aprovado | O cartão não traz horário; só "confirme antes de vir" |
| Nome aprovado | Hoje usa "Speed Financeira e Lan House" (recomendação, pendente) |
