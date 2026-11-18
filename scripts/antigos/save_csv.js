const fs = require('fs');

const csvRaw = `Código,Nome do Produto / Serviço,Categoria Oficial,Estoque,Preço de Custo (R$),Preço de Venda (R$),Lucro Unitário (R$),Margem de Lucro (%),Situação
294,Serviços Militares,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
166,Fone de Ouvido - PMCEL,Eletrônicos & Acessórios,-2,29.9,29.9,0,0,Ativo
82,Chocolate Waffer Ouro Branco Crocante,Bomboniere & Bebidas,0,3,3,0,0,Inativo
208,MEU INSS Cadastro,Serviços Públicos,0,49,49,0,0,Ativo
170,Gravação de CD (10),Lan House & Serviços Digitais,-2,10,10,0,0,Ativo
93,Conta GOV Prata,Serviços Públicos,-1,50,50,0,0,Ativo
4,Agendamento UAI,Serviços Públicos,-1,10,15,5,33.3,Ativo
199,Lacta Chocolate ao Leite,Bomboniere & Bebidas,-1,3.5,3.5,0,0,Inativo
378,Cadastro Nota Fiscal Prefeitura,Serviços Públicos,-1,20,20,0,0,Ativo
361,Fone PMLCELL FO-42,Eletrônicos & Acessórios,-1,9.99,19.98,9.99,50,Ativo
268,Planilha Simples,Lan House & Serviços Digitais,0,7,7,0,0,Ativo
318,Trento Chocolate 32g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
72,CEMIG Religação com Troca de Titularidade,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
193,IPTU,Serviços Públicos,-3,7,7,0,0,Ativo
373,Manutenção Celular Simples,Informática & Celular,-8,30,30,0,0,Ativo
162,Fanta Laranja 350ml Lata,Bomboniere & Bebidas,-2,5,5,0,0,Ativo
50,CAPINHA IPHONE EPI 5.4 AZUL,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
152,Envelope Pardo,Gráfica Rápida,-578,1,2,1,50,Ativo
366,REFRIG COCA COLA LT 310ML ZERO,Bomboniere & Bebidas,-1,3.05,5,1.95,39,Ativo
195,Kapo Morango 200ml,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Inativo
2,Abertura de MEI,Serviços Públicos,-2,50,50,0,0,Ativo
331,Trento Morango,Bomboniere & Bebidas,0,3,3,0,0,Inativo
341,Vivo Promoção,Lan House & Serviços Digitais,-4,25,30,5,16.7,Ativo
360,pe de moleque,Bomboniere & Bebidas,-56,0,3.5,3.5,100,Ativo
26,Bis Extra,Lan House & Serviços Digitais,0,3.5,3.5,0,0,Inativo
312,Trento Avelã Choco Branco 30g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
147,Encadernação 100 Folhas,Gráfica Rápida,-3,7,10,3,30,Ativo
6,Agua com gás 500ml,Bomboniere & Bebidas,-54,1.64,4,2.36,59,Ativo
266,pen drive multilaser 64GB,Eletrônicos & Acessórios,0,49,49,0,0,Ativo
33,Cabo Óptico,Eletrônicos & Acessórios,-2,15.9,15.9,0,0,Ativo
8,Arte Complexa -  Mais 10 minutos,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
90,Coca lata 350ml,Bomboniere & Bebidas,-14,3.05,5,1.95,39,Ativo
216,Nota fiscal,Serviços Públicos,-3,7,30,23,76.7,Ativo
243,Pelicula IPhone For 12 Pro Max 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
348,Assinatura GOV,Serviços Públicos,-3,10,15,5,33.3,Ativo
121,Detran ITPV,Serviços Públicos,0,15,15,0,0,Ativo
311,Trento Avelã Branco 32g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
51,CAPINHA IPHONE EPI 5.4 BRANCA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
67,Carteira Digital Impressão,Gráfica Rápida,-2,10,10,0,0,Ativo
213,MEU INSS Recuperação Senha,Serviços Públicos,-28,20,30,10,33.3,Ativo
17,Baixar Playlis CD,Lan House & Serviços Digitais,-9,5,5,0,0,Ativo
20,Recebimento de Arquivos,Lan House & Serviços Digitais,-967,1,1,0,0,Ativo
73,CEMIG Transferencia,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
173,Guia de Pagamento Ambiental,Serviços Públicos,-1,10,10,0,0,Ativo
349,Kit Carregador Gold V8 3.1,Eletrônicos & Acessórios,-2,13.4,29.9,16.5,55.2,Ativo
329,Trento Massimo Nuts 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
123,Detran Multa,Serviços Públicos,-6,15,15,0,0,Ativo
333,Trident Fresh Intense,Bomboniere & Bebidas,-15,2.5,2.5,0,0,Inativo
222,Paçoquinha 14g Piranguinho,Bomboniere & Bebidas,-35,1,1,0,0,Ativo
258,Pelicula Xiaomi Note 8 Pro,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
328,Trento Massimo Morango 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
218,Oi Promoção,Lan House & Serviços Digitais,0,25,25,0,0,Ativo
60,CAPINHA XIAOMI 9 LITE CINZA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
7,Agua sem Gás 500ml,Bomboniere & Bebidas,-49,1.46,3,1.54,51.3,Ativo
129,Detran Transferencia,Serviços Públicos,-2,30,30,0,0,Ativo
47,CAPINHA IPHONE 12 6.1 ROSE,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
264,Pen Drive 16Gb Multilaser,Eletrônicos & Acessórios,0,34.9,34.9,0,0,Ativo
74,Certidão Negativa,Serviços Públicos,-26,9.5,9.5,0,0,Ativo
96,Conversão e Edição Curriculo,Lan House & Serviços Digitais,0,7,7,0,0,Ativo
86,Claro Promoção,Lan House & Serviços Digitais,-4,25,30,5,16.7,Ativo
40,Capa de Celular LGK51s,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
177,Halls Menta,Bomboniere & Bebidas,-9,2.5,2.5,0,0,Inativo
21,Bala Lilith Sortida,Bomboniere & Bebidas,0,0.2,0.2,0,0,Inativo
334,Tridente Hortelã menta Azul,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
290,Segunda via Titulo E-eleitor,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
134,Doce de Banana,Bomboniere & Bebidas,-21,2,2,0,0,Ativo
70,CEMIG Cadastro,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
200,Lays clásica,Bomboniere & Bebidas,-2,5,5,0,0,Inativo
384,Cabo Carregamento Kaidi Tipo Micro  1m KD 22C,Eletrônicos & Acessórios,0,6,15,9,60,Ativo
368,COCA COLA PET ZERO 200ML PET,Bomboniere & Bebidas,-12,1.55,3.75,2.2,58.7,Ativo
156,Envio de Curriculo PDF,Lan House & Serviços Digitais,-18,5,5,0,0,Ativo
340,Vivo normal,Lan House & Serviços Digitais,-1,13,21.67,8.67,40,Ativo
1.1,Impressão P/B Balcão,Gráfica Rápida,-5306,1,1,0,0,Ativo
97,Converter arquivos Simples,Lan House & Serviços Digitais,0,4,4,0,0,Ativo
315,Trento Bites Paçoca 40g,Bomboniere & Bebidas,0,4,4,0,0,Inativo
99,COPASA Parcelamento de Debito,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
382,Cabo Carregamento Kaidi Tipo C 1m KD 22C,Eletrônicos & Acessórios,0,6,15,9,60,Ativo
347,Transferencia com Gravação em DVD / CD,Lan House & Serviços Digitais,-5,15,20,5,25,Ativo
371,Pen Drive Ecooda 16GB,Eletrônicos & Acessórios,0,13,29.9,16.9,56.5,Ativo
139,Doritos Nacho,Bomboniere & Bebidas,-2,4.99,4.99,0,0,Ativo
276,Recargas de celulares,Lan House & Serviços Digitais,0,0,0,0,0,Ativo
267,Pen Drive Multilaser TITAN  8GB,Eletrônicos & Acessórios,0,29.9,29.9,0,0,Ativo
154,Envio de arquivos,Lan House & Serviços Digitais,-101,5,5,0,0,Ativo
32,Cabo de metal magnético,Eletrônicos & Acessórios,0,49.9,49.9,0,0,Ativo
370,Pen Drive Ecooda 32GB,Eletrônicos & Acessórios,0,16,34.9,18.9,54.2,Ativo
257,Pelicula Xiaomi Note 8 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
339,USB Car Charger,Eletrônicos & Acessórios,0,19.9,19.9,0,0,Ativo
205,Meu INSS - Extrato de Pagamento/ Viagem,Serviços Públicos,-2,10,10,0,0,Ativo
106,Currículo Novo + PDF - 5 folhas,Lan House & Serviços Digitais,-64,10,15,5,33.3,Ativo
125,Detran Recibo,Serviços Públicos,0,15,15,0,0,Ativo
338,Tridente Tutti Frutti,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
85,Claro,Lan House & Serviços Digitais,-6,15,20,5,25,Ativo
111,DelValle Laranja 200ml,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
353,Fone PMCELL HP-62,Eletrônicos & Acessórios,0,29.9,59.8,29.9,50,Ativo
175,Halls Extra Forte,Bomboniere & Bebidas,-2,2.5,2.5,0,0,Inativo
157,Fandangos Presunto,Bomboniere & Bebidas,-6,2.99,2.99,0,0,Ativo
289,Segunda Via de Conta,Lan House & Serviços Digitais,-9,7.5,7.5,0,0,Ativo
43,CAPINHA IPHONE -XS SILICONE CASE ROSA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
150,Encadernação 50 Folhas,Gráfica Rápida,-6,10,10,0,0,Ativo
300,Subir conta GOV para Nivel Prata,Serviços Públicos,-3,30,30,0,0,Ativo
295,Sistema Operacional,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
171,Gravar Filme DVD Dual,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
256,Pelicula Xiaomi Note 10 Pro 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
13,Baixar Filmes Pendrive,Eletrônicos & Acessórios,-1,10,10,0,0,Ativo
191,Instalação de Aplicativos Simples,Lan House & Serviços Digitais,0,7,7,0,0,Ativo
201,Lays Classica 35g,Bomboniere & Bebidas,0,5,5,0,0,Inativo
220,Paçoca amor sing\`S,Lan House & Serviços Digitais,-7,1,1,0,0,Inativo
235,Pelicula For A21/A21S 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
211,Meu INSS Pedir Aposentadoria,Serviços Públicos,-1,20,20,0,0,Ativo
279,Recuperação Simples senha,Lan House & Serviços Digitais,-9,15,20,5,25,Ativo
228,Pelicula 9D For A52,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
327,Trento Massimo Duo 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
380,Consulta SPC Boa Vista Acerta - 353 Principal,Serviços Financeiros,-15,6.21,30,23.79,79.3,Ativo
27,Biscoito Oreo Mini,Lan House & Serviços Digitais,0,3,3,0,0,Inativo
165,Folha Avulsa,Lan House & Serviços Digitais,0,0.2,0.2,0,0,Ativo
297,Snickers Pé de Moleque 42g,Bomboniere & Bebidas,0,4,4,0,0,Inativo
144,Edição e envio de currículo,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
354,Fone PMCELL Bluetooth TWS HP-31,Eletrônicos & Acessórios,0,39,78,39,50,Ativo
57,CAPINHA M51 AZUL,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
20,Bala Icekiss Sortida,Bomboniere & Bebidas,0,0.15,0.15,0,0,Inativo
169,GPS Guia da Previdência Social,Serviços Públicos,-6,10,10,0,0,Ativo
151,Encadernação 500 folhas,Gráfica Rápida,0,15,25,10,40,Ativo
284,Ruffles Churrasco,Bomboniere & Bebidas,0,3.99,3.99,0,0,Ativo
252,Pelicula Xiaomi 10T Lite 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
174,Halls Cereja,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
346,Carteira de Pesca,Lan House & Serviços Digitais,0,40,40,0,0,Ativo
299,Sprite 350ml Lata,Bomboniere & Bebidas,-2,5,5,0,0,Ativo
10,Atestado de Bons Antecedentes,Serviços Públicos,-13,95,9.5,-85.5,-900,Ativo
210,MEU INSS Extrato de Contribuição,Serviços Públicos,0,10,10,0,0,Ativo
357,Fone PMLCELL FO-11,Eletrônicos & Acessórios,0,3.85,7.7,3.85,50,Ativo
197,Kuat Guaraná 350ml,Lan House & Serviços Digitais,0,5,5,0,0,Ativo
117,Detran CRLV Digital,Serviços Públicos,-37,10,15,5,33.3,Ativo
291,Seguro desemprego,Lan House & Serviços Digitais,0,15,20,5,25,Ativo
42,CAPINHA IPHONE -11 SILICONE CASE AZUL,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
281,Revelação de Foto 3x4 6 fotos,Gráfica Rápida,-29,14,15,1,6.7,Ativo
219,Ouro Branco,Lan House & Serviços Digitais,0,2,2,0,0,Inativo
159,Fanta Guaraná 200ml Pet,Bomboniere & Bebidas,-8,1.5,3.75,2.25,60,Ativo
168,Formatação e Backup de Celular,Informática & Celular,-1,49.9,49.9,0,0,Ativo
112,DelValle Uva 200ml,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
375,MEU INSS Desbloqueio INSS Emprestimo,Serviços Públicos,-6,25,30,5,16.7,Ativo
14,Baixar Musica Link até 2horas/,Lan House & Serviços Digitais,-11,5,5,0,0,Ativo
137,Doce pé de Moça,Bomboniere & Bebidas,-1,2,2,0,0,Ativo
46,CAPINHA IPHONE 12 6.1 AMARELA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
5,Agua 300ml,Bomboniere & Bebidas,-5,1.15,2.5,1.35,54,Ativo
103,Criação de Email/Facebook/instagran,Lan House & Serviços Digitais,-1,15,15,0,0,Ativo
163,Fanta Uva 350ml Lata,Bomboniere & Bebidas,0,5,5,0,0,Ativo
234,Pelicula For A11 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
203,Licença para motosserra,Lan House & Serviços Digitais,0,25,25,0,0,Ativo
245,Pelicula IPhone for 6G 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
77,Cheetos Queijo,Bomboniere & Bebidas,-1,3.5,3.99,0.49,12.3,Ativo
25,Big Rolha,Lan House & Serviços Digitais,0,2,2,0,0,Ativo
317,Trento cheesecake morango 32g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
39,Capa de celular LGK41s,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
326,Trento Massimo Dark 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
221,Paçoca Rolhão,Lan House & Serviços Digitais,0,2,2,0,0,Inativo
249,Pelicula MT G7/G7 Plus,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
88,Coca Cola 600ml Pet,Bomboniere & Bebidas,-3,4.1,7,2.9,41.4,Ativo
379,Leão Chá Verde Limão Zero,Lan House & Serviços Digitais,0,2.67,5.34,2.67,50,Ativo
52,CAPINHA IPHONE EPI 5.4 LARANJA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
183,Imigrante Chekilist,Lan House & Serviços Digitais,-3,50,50,0,0,Ativo
288,Segunda via CPF,Serviços Públicos,-4,10,10,0,0,Ativo
247,Pelicula K61 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
130,Diamante Negro,Lan House & Serviços Digitais,0,3.5,3.5,0,0,Ativo
365,NECTAR DEL VALLE S/ACUCAR LT 290ML GOIAB,Bomboniere & Bebidas,0,2.75,4.5,1.75,38.9,Ativo
126,Detran Registrar Intenção de Venda,Serviços Públicos,0,20,20,0,0,Ativo
280,RESULTADO DE EXAME,Lan House & Serviços Digitais,-34,5,5,0,0,Ativo
275,Quitação Eleitoral,Serviços Públicos,-3,6.5,6.5,0,0,Ativo
310,Trento Avelâ 32g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
344,Recebimento Internet,Lan House & Serviços Digitais,0,3,3,0,0,Ativo
115,Despacho correio,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
209,MEU INSS Cumprimento Exigência,Serviços Públicos,0,20,20,0,0,Ativo
316,Trento Branco-Dark 32g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
63,CAPINHA XIAOMI RM NOTE 7 PRETA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
12,Baconzitos,Bomboniere & Bebidas,0,3,3,0,0,Ativo
49,CAPINHA IPHONE 2 6.7 AZUL CLARA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
153,Envelope Plastico,Gráfica Rápida,0,0.75,2,1.25,62.5,Ativo
120,Detran IPVA,Serviços Públicos,-16,10,15,5,33.3,Ativo
31,Bubbaloo Uva,Lan House & Serviços Digitais,0,0.25,0.25,0,0,Inativo
149,Encadernação 25 Folhas,Gráfica Rápida,-4,5,8,3,37.5,Ativo
122,Detran licenciamento,Serviços Públicos,0,10,10,0,0,Ativo
293,Sensações Peito de Peru,Lan House & Serviços Digitais,-1,6,6,0,0,Ativo
321,Trento Duo,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
94,Contra Cheque portal do servidor,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
81,Chocolate  Waffer Sonho de Valsa,Bomboniere & Bebidas,0,3,3,0,0,Inativo
207,MEU INSS Atualização Cadastro,Serviços Públicos,0,15,15,0,0,Ativo
309,Trento Allegro Dark 35g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
54,CAPINHA IPHONE XS MAX SILICONE CINZA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
100,COPASA Religação com troca de Titularidade,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
302,Taxa de Consulta Simples,Lan House & Serviços Digitais,0,3,3,0,0,Ativo
202,Lays Cream,Bomboniere & Bebidas,0,5,5,0,0,Inativo
61,CAPINHA XIAOMI 9 LITE VERDE,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
34,Cadastro - CAIXA,Serviços Públicos,-2,15,15,0,0,Ativo
198,lacta Branco 34g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
350,Kit Carregador Gold 3.1 Tip C,Eletrônicos & Acessórios,-4,10.9,29.9,19,63.5,Ativo
274,Quitação de Multa,Serviços Públicos,0,6.5,6.5,0,0,Ativo
261,Pelicula Xiaomi RM Note 10 4G 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
148,Encadernação 200 folhas,Gráfica Rápida,0,12,15,3,20,Ativo
118,Detran Detran Certidão Negativa,Serviços Públicos,0,9.5,9.5,0,0,Ativo
305,Transferencia Complexa,Lan House & Serviços Digitais,-13,20,20,0,0,Ativo
320,Trento Dark Preto,Bomboniere & Bebidas,0,3,3,0,0,Inativo
196,Kit Smartphone,Lan House & Serviços Digitais,0,54.9,54.9,0,0,Ativo
277,Recebimento Colorido,Lan House & Serviços Digitais,0,1,1,0,0,Ativo
188,Impressão Papel Cartão,Gráfica Rápida,-107,5,6,1,16.7,Ativo
75,Certidão Quitação Eleitoral,Serviços Públicos,0,9.5,9.5,0,0,Ativo
69,Cebolitos,Bomboniere & Bebidas,-2,2.99,3.99,1,25.1,Ativo
240,Pelicula IPhone 3D 6G/7G/8G,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
306,Transferencia Simples,Lan House & Serviços Digitais,-14,10,10,0,0,Ativo
376,Recuperação INSS autenticação Fatores,Serviços Públicos,-6,30,40,10,25,Ativo
241,Pelicula IPhone 3D For 7G/8G,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
108,Declaração de Imposto de Renda,Serviços Públicos,-1,15,15,0,0,Ativo
226,Película 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
78,Cheetos Requeijão,Bomboniere & Bebidas,0,3.5,3.99,0.49,12.3,Ativo
155,Envio de contrato,Lan House & Serviços Digitais,0,0,0,0,0,Ativo
307,Trento Allegro Branco 35g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
336,Tridente Menta Verde,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
23,Bala My Toffe Chocolate,Bomboniere & Bebidas,0,0.25,0.25,0,0,Inativo
172,Gravar Filme DVD Simples,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
223,Pé de Moça,Bomboniere & Bebidas,-2,3.5,3.5,0,0,Ativo
260,Pelicula Xiaomi Redmi Note 6 Pro,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
36,Cadastro Simples site,Lan House & Serviços Digitais,-1,10,10,0,0,Ativo
179,Halls Mentol,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
296,Snickers Original 42g,Lan House & Serviços Digitais,0,4,4,0,0,Inativo
143,Edição de 1 folha de contrato,Lan House & Serviços Digitais,-1,10,10,0,0,Ativo
238,Pelicula For M31 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
176,Halls Melancia,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
56,CAPINHA IPHONE-XS SILICONE CASE PRETO,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
114,DelValle Uva 450ml,Lan House & Serviços Digitais,-2,4,4,0,0,Ativo
265,Pen Drive 32G,Eletrônicos & Acessórios,0,39,39,0,0,Ativo
270,Plastificação Identidade,Gráfica Rápida,-76,5,5,0,0,Ativo
286,Scanner,Gráfica Rápida,-629,1.25,1.5,0.25,16.7,Ativo
187,Impressão Papel Adesivo,Gráfica Rápida,-74,6,7,1,14.3,Ativo
217,Oi,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
362,Kit Carregador LEHMOX 4.1 Tipo C,Eletrônicos & Acessórios,0,11.8,23.6,11.8,50,Ativo
337,Tridente Morango,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
262,Pelicula Xiaomi RM NOTE 10S 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
330,Trento Massimo paçoca 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
87,Clips,Lan House & Serviços Digitais,0,0.25,0.25,0,0,Ativo
214,Motoboy,Lan House & Serviços Digitais,0,7,7,0,0,Ativo
359,Fone PMCELL FO-03 Microfone,Eletrônicos & Acessórios,0,4.5,9,4.5,50,Ativo
64,CAPINHA XIAOMI RM NOTE 7 VERMELHA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
358,Fone PMCELL FO-01 Microfone P2,Eletrônicos & Acessórios,-1,3.85,7.7,3.85,50,Ativo
158,Fandangos Queijo,Bomboniere & Bebidas,0,2.49,2.99,0.5,16.7,Ativo
138,Doce pé de moleque brigadeiro,Bomboniere & Bebidas,0,2,2,0,0,Ativo
248,Pelicula MT G7 Power 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
363,Kit Carregador LEHMOX 4.1 Iphone,Eletrônicos & Acessórios,0,11.9,23.8,11.9,50,Ativo
92,Consulta Simples,Lan House & Serviços Digitais,-25,5,5,0,0,Ativo
18,Baixar Playlist 100,Lan House & Serviços Digitais,-1,15,15,0,0,Ativo
342,Xerox,Gráfica Rápida,-164,0.5,1.0,0.5,50,Ativo
65,Carregador PMCEEL 15W,Eletrônicos & Acessórios,0,69.5,69.5,0,0,Ativo
22,Bala mole,Bomboniere & Bebidas,0,0.2,0.2,0,0,Inativo
127,Detran Renovação,Serviços Públicos,-3,20,20,0,0,Ativo
246,Pelicula IPhone For 6G 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
356,Fone PMCELL FO-02 Microfone,Eletrônicos & Acessórios,0,4.25,15,10.75,71.7,Ativo
308,Trento allegro choco amendoim 35g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
160,Fanta Guaraná 350ml,Bomboniere & Bebidas,0,2.75,5,2.25,45,Ativo
128,Detran Solicitação Definitiva,Serviços Públicos,0,15,15,0,0,Ativo
244,Pelicula IPhone For 12/12 Pro 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
62,CAPINHA XIAOMI RM NOTE 7 CINZA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
269,Plastificação A4,Gráfica Rápida,-75,8,8,0,0,Ativo
45,CAPINHA IPHONE 11 VERDE,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
53,CAPINHA IPHONE IPI2 6.7 AZUL,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
55,CAPINHA IPHONE XS SILICONE CASE AZUL,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
271,Plicula Xiaomi 4D MI SE PRETO,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
41,Capa pra Celular,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
229,Pelicula 9D Iphone For 6G,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
251,Pelicula PC X3 PRO 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
79,Chicletes Hortelã,Bomboniere & Bebidas,0,0.5,0.5,0,0,Inativo
178,Halls Menta Prata,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
44,CAPINHA IPHONE 11 ROSA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
298,Sonho de valsa,Lan House & Serviços Digitais,0,2,2,0,0,Inativo
237,Pelicula For G7/G7 Plus  9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
360,Fone PMCELL FO-21,Eletrônicos & Acessórios,0,8.9,17.8,8.9,50,Ativo
107,DAS MEI,Serviços Públicos,-7,6.5,9.5,3,31.6,Ativo
381,Consulta Processual,Lan House & Serviços Digitais,0,25,25,0,0,Ativo
71,CEMIG Parcelamento de Debito,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
324,Trento Massimo Branco 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
142,E-Prepag,Lan House & Serviços Digitais,0,0,0,0,0,Ativo
95,Contrato de Locação,Lan House & Serviços Digitais,-15,35,35,0,0,Ativo
323,Trento Maracuja 32g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
184,IMIGRANTES ALTERAÇÃO DE ENDEREÇO,Lan House & Serviços Digitais,0,30,30,0,0,Ativo
206,MEU INSS Agendamento Solictações,Serviços Públicos,0,15,15,0,0,Ativo
11,Backup e Configuração Celular,Informática & Celular,-1,50,50,0,0,Ativo
301,Suporte ao Cliente,Lan House & Serviços Digitais,-137,3,3,0,0,Ativo
91,Coca Pet 200ml,Bomboniere & Bebidas,-18,1.55,3.75,2.2,58.7,Ativo
314,Trento Bites Maracuja 40g,Bomboniere & Bebidas,0,4,4,0,0,Inativo
89,Coca Lata 220ml,Bomboniere & Bebidas,-1,2.14,4,1.86,46.5,Ativo
59,CAPINHA SAMSUNG M51 PRETO,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
161,Fanta Laranha 200ml Pet,Bomboniere & Bebidas,0,3.75,3.75,0,0,Ativo
287,Segunda via boleto simples,Lan House & Serviços Digitais,-1,2,3,1,33.3,Ativo
132,Digitação de Contratos,Lan House & Serviços Digitais,0,30,30,0,0,Ativo
38,Caneta Preta,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
230,Pelicula A51,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
239,Pelicula IPhone 12 6.1 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
383,Cabo Carregamento Kaidi Tipo Lightning Iphone 1m KD 22C,Eletrônicos & Acessórios,-2,6,15,9,60,Ativo
19,Bala Chita Sortida,Bomboniere & Bebidas,0,0.2,0.2,0,0,Inativo
232,Pelicula For A01 Core 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
76,Cheetos Parmesão,Bomboniere & Bebidas,0,0,3.99,3.99,100,Ativo
304,Tim Promoção,Lan House & Serviços Digitais,-4,25,30,5,16.7,Ativo
80,Chicletes Tutti Frutti,Bomboniere & Bebidas,0,0.5,0.5,0,0,Inativo
15,Baixar música avulso,Lan House & Serviços Digitais,-38,15,2,-13,-650,Ativo
136,Doce de Mocotó,Bomboniere & Bebidas,0,2,2,0,0,Ativo
355,Fone PMCELL FO15,Eletrônicos & Acessórios,0,8.5,17,8.5,50,Ativo
204,Lollo,Lan House & Serviços Digitais,0,3,3,0,0,Ativo
332,Trident Canela,Bomboniere & Bebidas,0,0,0,0,0,Inativo
104,Criação de Usuário Aplicativo Bancário,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
352,Fone Bluetoooth TWS HP 35,Eletrônicos & Acessórios,0,39.99,79.98,39.99,50,Ativo
212,MEU INSS Pericia Médica,Serviços Públicos,0,20,20,0,0,Ativo
181,Halls Morango,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
24,Banheiro,Lan House & Serviços Digitais,0,2,2,0,0,Ativo
224,Pé de Moleque,Bomboniere & Bebidas,0,3.5,3.5,0,0,Ativo
140,DVD Virgem,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
131,Digitação,Lan House & Serviços Digitais,-23,8,8,0,0,Ativo
236,Pelicula For A51 9D,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
254,Pelicula Xiaomi 4D MI 9 SE,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
66,Carregador Usb PMCELL,Eletrônicos & Acessórios,0,44.9,44.9,0,0,Ativo
233,Pelicula For A10 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
58,CAPINHA M51 ROSA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
180,Halls Mini Melancia,Bomboniere & Bebidas,0,3,3,0,0,Inativo
28,Boletim de Ocorrencia,Lan House & Serviços Digitais,0,25,25,0,0,Inativo
1,5 Star,Bomboniere & Bebidas,0,3,3,0,0,Inativo
2,Impressão Colorida,Gráfica Rápida,-915,1.5,2,0.5,25,Ativo
84,Cifra/Letra,Lan House & Serviços Digitais,-10,3,3,0,0,Ativo
364,Kit Carregador LEHMOX 4.1 Micro V8,Eletrônicos & Acessórios,0,11.8,23.6,11.8,50,Ativo
322,Trento Limão 32g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
102,Copia CD,Gráfica Rápida,0,10,10,0,0,Ativo
164,Fanta Uva Lata 220,Bomboniere & Bebidas,0,2.07,3.75,1.68,44.8,Ativo
48,CAPINHA IPHONE 2 6.1 VERMELHA,Eletrônicos & Acessórios,0,20,20,0,0,Ativo
292,Sensações Frango Grelhado,Lan House & Serviços Digitais,0,6,6,0,0,Ativo
116,Detran consultar pontuação,Serviços Públicos,0,10,20,10,50,Ativo
113,DelValle Uva 250ml,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
215,Multa meio ambiente,Serviços Públicos,0,7,10,3,30,Ativo
16,Baixar playlis 250 música,Lan House & Serviços Digitais,-4,20,25,5,20,Ativo
303,Tim,Lan House & Serviços Digitais,-1,15,20,5,25,Ativo
273,Qualificação CPF,Serviços Públicos,-1,6.5,10,3.5,35,Ativo
192,Instalar jogo,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
401,Cha Mate Leão Pessego,Lan House & Serviços Digitais,6,2.79,4.5,1.71,38,Ativo
325,Trento Massimo Chocolate 30g,Bomboniere & Bebidas,0,3.5,3.5,0,0,Inativo
255,Pelicula Xiaomi MI 8 Lite 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
110,DelValle Frutas Citricas 450ml,Lan House & Serviços Digitais,0,4,4,0,0,Ativo
185,Impressão acima de 150 Folhas,Gráfica Rápida,0,0.4,0.4,0,0,Ativo
343,XEROX COLORIDA,Gráfica Rápida,0,1.5,1.5,0,0,Ativo
29,Bubbaloo Morango,Lan House & Serviços Digitais,0,0.25,0.25,0,0,Inativo
250,Pelicula PC X3 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
253,Pelicula Xiaomi 10T xm 10t Pro,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
124,Detran Parcelamento de Debito,Serviços Públicos,-1,20,20,0,0,Ativo
3,Acesso a Internet,Lan House & Serviços Digitais,-267,0,0,0,0,Ativo
105,Curriculo - 5 Folhas,Lan House & Serviços Digitais,-71,10,10,0,0,Ativo
68,CD Virgem,Lan House & Serviços Digitais,0,2,2,0,0,Ativo
259,Pelicula Xiaomi Note 9 Pro/9S 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
190,Impressão Preto e Branco,Gráfica Rápida,-6955,0.5,0.5,0,0,Ativo
351,Kit Carregador Gold Iphone 3.1,Eletrônicos & Acessórios,0,10.9,29.9,19,63.5,Ativo
30,Bubbaloo Tutti Fruti,Lan House & Serviços Digitais,0,0.25,0.25,0,0,Inativo
101,COPASA Transferencia de titularidade,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
225,Peicula Fr IPhone 7/8 Plus 3D,Lan House & Serviços Digitais,0,15,15,0,0,Ativo
231,Película de vidro,Eletrônicos & Acessórios,0,5,5,0,0,Ativo
272,Prestigio 33g,Lan House & Serviços Digitais,0,3,3,0,0,Ativo
319,Trento Creme 32g,Bomboniere & Bebidas,0,3,3,0,0,Inativo
133,Doce Cocada Branca,Bomboniere & Bebidas,0,2,2,0,0,Inativo
282,Roll Dadinho 32g,Lan House & Serviços Digitais,0,3,3,0,0,Ativo
313,Trento Bites Limão 40g,Bomboniere & Bebidas,0,4,4,0,0,Inativo
182,Halls Uva Verde,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
369,Pen Drive Ecooda 4GB,Eletrônicos & Acessórios,0,10,20,10,50,Ativo
367,REFRIG COCA COLA LT 220ML S/ACUCAR,Bomboniere & Bebidas,0,2.14,3.75,1.61,42.9,Ativo
194,Kapo Laranja 200ml,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Inativo
98,COPASA Cadastro,Lan House & Serviços Digitais,0,10,10,0,0,Ativo
141,E-defesa Receita Federal Termo para Preenchimento,Serviços Públicos,-1,10,10,0,0,Ativo
37,Caneta Azul,Lan House & Serviços Digitais,0,2.5,2.5,0,0,Ativo
135,Doce de Leite Puro,Bomboniere & Bebidas,0,2,2,0,0,Ativo
35,Cadastro Emprego,Lan House & Serviços Digitais,-4,20,20,0,0,Ativo
263,Pelicula Xiaomi RM Note 7 Pro 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
285,Ruffles Original,Bomboniere & Bebidas,0,3.99,3.99,0,0,Ativo
119,Detran Exame legislação,Serviços Públicos,0,10,10,0,0,Ativo
189,Impressão Papel Fotográfico,Gráfica Rápida,-117,5,6,1,16.7,Ativo
283,Ruffles Cebola e Salsa,Bomboniere & Bebidas,-2,3.99,3.99,0,0,Ativo
372,Cabo Iphone Ecooda 18w,Eletrônicos & Acessórios,0,30,30,0,0,Ativo
374,Concurso Varginha,Lan House & Serviços Digitais,0,20,20,0,0,Ativo
146,Edição simples,Lan House & Serviços Digitais,-46,2,2,0,0,Ativo
145,Edição OCR,Lan House & Serviços Digitais,-14,15,15,0,0,Ativo
109,Deletar Aplicativo,Lan House & Serviços Digitais,0,7,7,0,0,Ativo
227,Pelicula 3D IPhone for 6G,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
9,Arte Simples - 10 minutos,Lan House & Serviços Digitais,-7,15,15,0,0,Ativo
167,Formatação de Computador,Informática & Celular,0,69.9,69.9,0,0,Ativo
242,Pelicula IPhone For 12 Mini 3D,Eletrônicos & Acessórios,0,15,15,0,0,Ativo
335,Tridente Melancia,Bomboniere & Bebidas,0,2.5,2.5,0,0,Inativo
400,Cha verde Leão 450ml,Lan House & Serviços Digitais,6,2.79,4.5,1.71,38,Ativo
83,Chokito,Lan House & Serviços Digitais,0,3,3,0,0,Inativo`;

fs.writeFileSync('server/data/produtos_speed.csv', csvRaw.trim(), 'utf8');
console.log('Saved produtos_speed.csv!');
