# Baixar PDFs e fotos do WhatsApp automaticamente

Extensão do Chrome que baixa sozinha os **PDFs e as fotos (JPEG, PNG, WebP)** recebidos em **conversas individuais** do WhatsApp Web. O arquivo cai na pasta de downloads do perfil (hoje `L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos`) e aparece na fila de impressão do Nexcafe com o nome do cliente na frente ("Beatriz - foto.jpeg").

## O que ela faz

- Escuta as mensagens novas do WhatsApp Web.
- Baixa **PDF** (`application/pdf`, nome terminando em `.pdf` ou assinatura `%PDF`) e **imagem** (`image/jpeg`, `image/png`, `image/webp` ou assinatura JPEG/PNG/RIFF) — foto de documento, RG, CNH, comprovante.
- Ignora **grupos**, listas de transmissão, canais, **figurinhas (sticker)**, **GIF**, vídeo, áudio e mensagens enviadas por você.
- Não baixa o histórico: só o que chega depois que a extensão está ativa.
- Não envia mensagem, não lê conversa antiga e não manda nada para fora do computador.

Ela aproveita o objeto `WPP` que a extensão **WaSpeed** já carrega no WhatsApp Web. Se o WaSpeed for desativado, a extensão para de funcionar (o WhatsApp Web não tem download automático de documento).

## Instalar (uma vez)

1. No Chrome, entre no perfil que usa o WhatsApp (o mesmo do atalho, perfil 21).
2. Abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha esta pasta:
   `D:\Sistema Nexcafe\LanHouseManager\extensoes\whatsapp-pdf`
5. Abra o WhatsApp Web e aperte **F5**.
6. Abra o console (F12) e confira a mensagem:
   `[Nexcafe] download automatico de PDF e fotos ativo (somente conversas individuais).`

Se o Chrome perguntar se o site pode baixar vários arquivos, clique em **Permitir**. Para já deixar liberado: `chrome://settings/content/automaticDownloads` > **Adicionar** > `https://web.whatsapp.com`.

## Atualizar (quando mudar o código)

1. Abra `chrome://extensions`.
2. No cartão da extensão, clique no botão **Atualizar** (↻).
3. Volte na aba do WhatsApp Web e aperte **F5**.

## Testar

1. De um celular, mande um PDF em uma conversa individual (não em grupo).
2. O arquivo deve aparecer em `L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos`.
3. O `Vigiar-Downloads.ps1` abre o PDF no Chrome e aciona o Ctrl+P.

No console do WhatsApp Web aparece `[Nexcafe] PDF baixado: nome.pdf (tamanho)`.

## Se não baixar

- Confirme que a extensão **WaSpeed** está ativa em `chrome://extensions`.
- Confirme que esta extensão está ativa e que o WhatsApp Web foi recarregado depois de instalá-la.
- Veja o console (F12) por mensagens `[Nexcafe]`. `nao consegui baixar` indica que o WPP não entregou o arquivo: tente de novo com outra mensagem e confira se o WaSpeed foi atualizado.
- PDFs muito grandes podem demorar alguns segundos; a extensão tenta 5 vezes.

## Desligar

Em `chrome://extensions`, desative ou remova **Nexcafe - Baixar PDFs do WhatsApp**. O restante do sistema (impressão, caixa, financeira) não depende dela.
