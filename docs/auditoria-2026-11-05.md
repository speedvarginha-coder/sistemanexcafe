# Auditoria do projeto (05/11/2026)

O que foi auditado:
- o servidor Nexcafe (`server/`) e o agente das estações (`client-agent/`);
- o painel Speed Marketing e as tarefas agendadas;
- o site speedfinanceira.com.br, com as 169 páginas do sitemap baixadas e analisadas;
- a ficha do Google, pela última leitura da API, e o GeoGrid.

## Situação em 05/11/2026, depois das correções

- Item 3: arquivos do site corrigidos para 9h às 13h (horário decidido em 05/11). Os arquivos alterados foram a home, o Sobre, as 5 páginas de cidade, os 3 artigos e o gerador `apply_features.py`; o roteiro do robô também foi atualizado. **A publicação no ar continua pendente.**
- Item 13: teste corrigido. Agora são 70 de 70 testes passando.
- Itens 14 e 15: 40 backups manuais anteriores a 18/10 (22,9 MB) foram para a Lixeira do Windows. Os scripts avulsos foram para `scripts/antigos/`.

## Prioridade alta

1. **O cofre de senhas não tem senha mestre, e a chave vai para o Google Drive.**
   - Hoje o cofre guarda 8 itens no modo automático. A chave `server/data/cofre.chave` fica ao lado do banco.
   - O backup copia a chave e o banco juntos para `L:\Meu Drive\Backup Nexcafe`.
   - O `db.json` também guarda em texto puro o segredo OAuth, o refresh token da ficha e a chave do Places.
   - Por isso, quem abrir essa pasta do Drive lê tudo isso.
   - **Correção:** ativar a senha mestre do cofre no painel (a função já existe) e manter a verificação em duas etapas na conta Google do Drive.
2. **O painel responde a qualquer PC da rede, inclusive às 8 estações dos clientes.**
   - A opção "Painel só neste computador" (`panelOnlyHere`) está desligada.
   - O tráfego é HTTP, sem criptografia.
   - O login tem limite de tentativas e senha forte. Mesmo assim, um cliente na estação consegue abrir a tela de login.
   - **Correção:** se só o caixa usa o painel, ligue a opção. As estações continuam funcionando, porque as rotas delas são liberadas.
3. **O horário de sábado está diferente em cada lugar.**
   - Na ficha do Google é 9h às 12h30.
   - No site é 8h às 12h. Aparece no schema da home e nestes artigos: `consignado-clt-como-funciona`, `financiamento-veicular-como-funciona` e `novas-regras-consignado-inss-2026`.
   - O Google cruza esses dados. Confirme o horário certo e corrija o outro lado, e também o roteiro do robô do WhatsApp.
4. **A ficha está há 3,5 meses sem avaliação nova.**
   - A última é de 20/07/2026. São 212 avaliações, com média 4,8.
   - Avaliação recente é um dos fatores que mais pesam no Maps.
   - O link e a mensagem já estão prontos em Google > Saúde da ficha > Pedir avaliação. Falta usar depois de cada contrato pago.
5. **Os produtos principais não aparecem no top 3 do Maps.** Última medição do GeoGrid:

   | Termo | Posição média | Pontos no top 3 |
   |---|---|---|
   | empréstimo consignado | 4 | 0% |
   | empréstimo | 5 | 0% |
   | financeira | 2,9 | 68% |
   | antecipação FGTS | 2,2 | 100% |

   Os itens 3, 4, 6 e 7 desta lista são as alavancas para subir nesses termos.

## Prioridade média

6. **O site cadastrado na ficha é `http://www.speedfinanceira.com.br/`.**
   - O visitante passa por 2 redirecionamentos.
   - Sem UTM, as visitas que vêm da ficha não se separam das outras.
   - Trocar para `https://speedfinanceira.com.br/?utm_source=google&utm_medium=organic&utm_campaign=ficha`.
7. **A ficha não tem horários especiais cadastrados.** Datas que faltam: 15/11, 20/11 (feriado nacional), 24 e 25/12, 31/12 e 01/01. O Google mostra "pode estar fechado" quando falta essa informação.
8. **Os títulos das páginas estão longos demais.**
   - A mediana é de 113 caracteres, e 167 das 169 páginas passam de 60. O Google corta perto de 60 e acaba reescrevendo o título.
   - Além disso, 69 descrições passam de 160 caracteres.
   - Correção: deixar o termo principal e a cidade no começo do título, e terminar com "| Speed Varginha".
9. **Há artigos do blog curtos.**
   - Dos 30 artigos no ar, 18 têm menos de 800 palavras.
   - Os menores: `nova-regra-fgts-em-vigor-novembro-como-funciona` (481), `decimo-terceiro-aposentados-como-usar-sem-novas-dividas` (488) e `passo-a-passo-autorizar-consulta-app-fgts-pix` (547).
   - Comece pelos de produto prioritário: consignado CLT, INSS e refinanciamento.
10. **O Search Console está sem autorização.** Falta clicar em "Conectar de novo" no cartão de conexão. Até lá, o cartão "Buscas do site" fica vazio.
11. **O post automático da ficha só sai no dia marcado.**
    - Se o PC do caixa ficar desligado naquele dia (por exemplo, numa queda de energia), o post é pulado para sempre.
    - O primeiro post automático é em 22/12. Até lá, os 13 posts de novembro são manuais.
    - Correção sugerida: publicar também os posts dos 2 dias anteriores que ficaram para trás.

## Manutenção

12. **Há trabalho sem commit.**
    - A correção da tela de bloqueio do agente, de 22/10. Ela já roda nas estações pela atualização automática.
    - A reorganização da aba Google, `posts_fila.js` e as 8 artes de novembro.
    - Os documentos em `docs/`.
13. **Um teste quebrou por usar data fixa.** O teste "queda de energia" usa o arquivo `db-2026-10-01.json`, que a limpeza de 30 dias passou a apagar. O defeito é do teste, não do servidor. Correção: usar datas relativas a hoje.
14. **Há backups manuais acumulados.** São 46 cópias `.bak` em `server/data` (37 MB no total), e cada uma tem os mesmos segredos do banco. Apague as anteriores a outubro. A cópia no Drive nunca apaga nada, e hoje ocupa 38 MB.
15. **Há scripts avulsos versionados na raiz.**
    - Os arquivos `scratch_*.js`, `fix_prices.js`, `populate_real_db.js` e `update_db_config.js` gravam no `db.json`.
    - Se algum rodar com o servidor ligado, o servidor sobrescreve a alteração.
    - Mover para `scripts/antigos/` ou apagar.
16. **Faltam dois cabeçalhos de segurança no site.** O site não envia `Strict-Transport-Security` nem `X-Content-Type-Options`. Dá para configurar no hPanel ou no `.htaccess`.
17. **Ignore o item "palavra-chave no nome" da saúde da ficha.** Colocar termos no nome da empresa fere as regras do Google e pode suspender a ficha. Esse item deveria sair da nota.

## O que está certo

- **Login e sessão:**
  - senhas com scrypt, comparadas em tempo constante;
  - limite de tentativas de login e de vinculação;
  - cookie `HttpOnly` e `SameSite=Strict`, e conferência de origem em toda gravação.
- **Arquivos e dados:**
  - o painel de marketing só abre para o administrador, e o caminho dos arquivos é conferido contra path traversal;
  - os dados vindos do Google passam por escape antes de virar HTML.
- **Banco:**
  - gravado em arquivo temporário e depois renomeado;
  - restaura sozinho do backup válido mais recente quando o arquivo está ilegível;
  - cópia por hora para o Drive, com a última feita às 17h37 de hoje.
- **Site:**
  - as 169 URLs do sitemap respondem 200, todas com canonical, um único H1, schema e WhatsApp;
  - nenhuma página traz o telefone antigo;
  - o SpeedGEO e os posts futuros respondem 404, e `.env` e `.git` são bloqueados.
- **Testes e rotinas:** 69 de 70 testes passam, e as tarefas agendadas do blog, do marketing e do backup terminaram sem erro.
