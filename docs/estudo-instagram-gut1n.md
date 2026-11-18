# Estudo do Instagram @gut1n: ferramentas que servem ao projeto

Perfil: Pedro Augusto (@gut1n), 504 posts e 40,7 mil seguidores. É cofundador de uma empresa de cursos e vende um curso de Claude.
Lido em 30/10/2026. Analisei as legendas dos 129 posts mais recentes, de setembro e outubro de 2026. Os outros 475 são mais antigos e não entraram.

Quase todo post segue o mesmo formato: "comente o código (E98, F21...) que te mando o guia no direct". O nome da ferramenta e o resumo estão na legenda; o passo a passo fica no guia, que não abri.
As promessas são do autor. Antes de instalar qualquer coisa, confira o repositório oficial, a licença e quem mantém o projeto.

## O que já está instalado aqui

Seis coisas que ele indica já estão neste computador:

| Ferramenta | Post | Situação |
|---|---|---|
| Graphify (mapa do projeto para o Claude Code) | E66, E52 | instalado e no CLAUDE.md |
| /watch (o Claude assiste vídeo) | E41 | instalado |
| Ponytail (corta código desnecessário) | E14 | instalado e ativo |
| Impeccable (regras de design) | D89 | instalado; é o hook que avisa sobre contraste |
| Regras de design do Emil Kowalski | D89 | instalado no pacote agentic-awesome-skills (emil-design-eng) |
| Agency Agents (mais de 280 especialistas) | E73 | instalado (são os agentes "Ad Creative Strategist", "SEO Specialist" etc.) |

## Vale testar no projeto

### 1. Redes sociais da Speed (aba Social Mídia e Artes)

- **Conector do Metricool (E80):** o Claude escreve, planeja e agenda os posts do Instagram, até 20 por mês no plano grátis, e lê os números. Encaixa na esteira de posts das redes sociais. Conferir se o Metricool também agenda posts no Perfil da Empresa no Google: se agendar, resolve a programação da ficha sem esperar a Business Profile API.
- **Blotato (D72):** posta em 9 redes de uma vez pelo Claude. O Google não está entre as 9. Fica como segunda opção ao Metricool.
- **Skill de carrossel (E74, E29, D88):** gera visual, gancho, texto e chamada final. Serve para os carrosséis do Instagram da financeira e dos serviços digitais, sempre separados.
- **Edição de Reels pelo Claude (D97 video-use, D67, E35, E33):** corta pausas e erros, põe legenda palavra por palavra e gera versões. Bom para vídeos curtos de atendimento e dicas.
- **Jev, nota para os ganchos (E32):** lê os vídeos já postados e dá nota para cada gancho. Ajuda a ver o que funcionou no Instagram da Speed.

### 2. Atendimento pelo WhatsApp (aba Marketing e WhatsApp)

- **WhatsApp pela API oficial da Meta + n8n + Claude Haiku (E19):** responde a partir dos fatos que a loja cadastrar e registra cada conversa. É o caminho certo para um atendente automático no (35) 3067-5017.
- **Evitar o whatsapp-mcp (E17):** ele entra na conta como um aparelho conectado, igual ao WhatsApp Web. Não é API oficial, e o número de uma financeira não pode correr risco de bloqueio. Para conversa com cliente de crédito, só a API oficial.

### 3. SEO local e aparecer nas respostas de IA (aba SpeedGeo)

- **Ciclo de 6 passos para ser citado pelo ChatGPT, Claude e Google (E50):** ver se a IA sabe que a loja existe, achar no Search Console as buscas sem página, responder direto no começo da página e repetir. Combina com a planilha de palavras-chave e com o SpeedGeo.
- **Revisão de links internos do site (E76):** uma IA de sim ou não leu 600 páginas em 45 segundos para conferir links. Útil para o speedfinanceira.com.br.

### 4. Anúncios (aba Anúncios Google e Meta)

- **Ads Creative Studio da Meta (E57):** mostra quais criativos funcionam, compara com o setor e gera variações. Atenção às regras da Meta para crédito: categoria especial de anúncio e sem promessa de aprovação.

### 5. Uso do Claude Code neste projeto

- **Comando /insights (E72):** já vem no Claude Code. Lê as conversas salvas e aponta erros repetidos e tarefas que se repetem. Vale rodar, porque o projeto tem muitas sessões longas.
- **Gastar menos limite (E36):** a cada mensagem o Claude recarrega toda a configuração, inclusive skills que não são usadas. Este computador tem mais de mil skills instaladas, e só a lista delas pesa em toda conversa. Desativar os pacotes que não são usados (Azure, Odoo, Unity, Roblox, jogos, China etc.) deixa tudo mais rápido e barato.
- **Conselheiro Sonnet + Opus (E39):** o Sonnet faz o dia a dia e o Opus só opina nas decisões difíceis. Útil para tarefas longas e mecânicas, como programar posts.

### 6. Computadores da lan house (client-agent)

- **Win11Debloat (E63):** limpa o Windows 10 e 11 com um comando. Pode deixar as máquinas dos clientes mais leves. Testar antes em um computador só, com backup, porque mexe no sistema e pode conflitar com o LanHouseAgent.
- **Backrest (E87):** backup automático de pastas. Pode copiar o D:\Sistema Nexcafe (db.json e backups) para outro disco ou para a nuvem todo dia. Complementa o backup diário que o servidor já faz.

## Não serve agora

Pesquisa de remédios (E25), estúdio 3D com webcam (D94), idiomas (E44), app de treino (F18), PC velho com Linux (E87, menos o Backrest), Kimi K3.1 (E53), imobiliária (D66), cursos e listas de estudo (E92, E93, E94) e os posts sobre medo de IA ou existência de Deus.
Ferramentas que guardam documentos de clientes (Paperless-ngx, E26) pedem cuidado com a LGPD: documento de cliente de crédito não deve ir para um app de terceiros sem decisão da loja.

## Ordem sugerida

1. Testar o Metricool, conferindo se agenda posts na ficha do Google.
2. Rodar o /insights e desativar os pacotes de skills que não são usados.
3. Montar o atendente de WhatsApp pela API oficial, começando com o número de teste da Meta.
4. Configurar o Backrest para o backup do Nexcafe.
