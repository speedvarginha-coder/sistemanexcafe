#requires -Version 5.1
<#
  gerar_citacoes.ps1
  Gera blocos de citação padronizados (NAP + descrições) para os diretórios,
  a partir de dados/nap.json, e valida o NAP nas páginas públicas.

  Não publica, não envia e não altera nada fora de dados/citacoes/.
  Uso: powershell -ExecutionPolicy Bypass -File ferramentas\gerar_citacoes.ps1
#>

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$dados = Join-Path $raiz 'dados'
$paginas = Join-Path $raiz 'paginas'
$saida = Join-Path $dados 'citacoes'
$napPath = Join-Path $dados 'nap.json'
$kit20 = Join-Path $raiz '20_Kit_Cadastro_Diretorios.md'

if (-not (Test-Path -LiteralPath $napPath)) {
  throw "Fonte de NAP nao encontrada: $napPath"
}

$nap = Get-Content -LiteralPath $napPath -Raw -Encoding UTF8 | ConvertFrom-Json

$nome = $nap.nome_exibicao
$nomeCurto = $nap.nome_curto
$cnpj = $nap.cnpj
$tel = $nap.telefone.exibicao
$whats = 'https://wa.me/' + $nap.telefone.whatsapp
$email = $nap.email
$site = $nap.site
$logradouro = $nap.endereco.logradouro
$numero = $nap.endereco.numero
$bairro = $nap.endereco.bairro
$cidade = $nap.endereco.cidade
$uf = $nap.endereco.uf
$cep = $nap.endereco.cep

$enderecoLinha = "$logradouro, $numero - $bairro - $cidade/$uf - CEP $cep"
$enderecoCurto = "$logradouro, $numero - $bairro - $cidade/$uf"

function Gravar-Utf8Bom {
  param([string]$Caminho, [string]$Conteudo)
  $utf8 = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($Caminho, $Conteudo, $utf8)
}

function Extrair-Bloco {
  param([string]$Texto, [string]$Id)
  $padrao = '<!-- DESC-' + $Id + ' -->(.*?)<!-- /DESC-' + $Id + ' -->'
  $m = [regex]::Match($Texto, $padrao, [Text.RegularExpressions.RegexOptions]::Singleline)
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ''
}

function Esc-Csv {
  param([string]$Valor)
  if ($null -eq $Valor) { $Valor = '' }
  return '"' + $Valor.Replace('"', '""') + '"'
}

$descCurta = ''
$descMedia = ''
$descLonga = ''
if (Test-Path -LiteralPath $kit20) {
  $textoKit = Get-Content -LiteralPath $kit20 -Raw -Encoding UTF8
  $descCurta = Extrair-Bloco -Texto $textoKit -Id 'CURTA'
  $descMedia = Extrair-Bloco -Texto $textoKit -Id 'MEDIA'
  $descLonga = Extrair-Bloco -Texto $textoKit -Id 'LONGA'
}

if (-not $descCurta) {
  $descCurta = "Correspondente bancario e lan house no Centro de $cidade. Consignado, impressao, xerox, foto 3x4 e servicos digitais. WhatsApp $tel."
}

$blocoNap = @"
$nome
Correspondente bancario - CNPJ $cnpj
$enderecoLinha
Telefone e WhatsApp: $tel
E-mail: $email
Site: $site
Horario: A CONFIRMAR (Decisao 2)
"@

$blocoNapCurto = "$nome | $enderecoCurto | $tel | $site"

$links = @"
Link base do WhatsApp: https://wa.me/$($nap.telefone.whatsapp)
[GRAF]  https://wa.me/$($nap.telefone.whatsapp)?text=$([uri]::EscapeDataString('Ola! Quero orcamento de impressao ou foto 3x4. [GRAF]'))
[CONS]  https://wa.me/$($nap.telefone.whatsapp)?text=$([uri]::EscapeDataString('Ola! Quero orientacao sobre consignado. [CONS]'))
[DIG]   https://wa.me/$($nap.telefone.whatsapp)?text=$([uri]::EscapeDataString('Ola! Preciso de ajuda com um servico digital. [DIG]'))
[PERFIL] https://wa.me/$($nap.telefone.whatsapp)?text=$([uri]::EscapeDataString('Ola! Vim pelo Perfil da Empresa no Google. [PERFIL]'))
[GERAL] https://wa.me/$($nap.telefone.whatsapp)?text=$([uri]::EscapeDataString('Ola! Vim pelo site e quero atendimento. [GERAL]'))
"@

if (-not (Test-Path -LiteralPath $saida)) {
  New-Item -ItemType Directory -Path $saida -Force | Out-Null
}

$dataGeracao = Get-Date -Format 'yyyy-MM-dd HH:mm'
$leia = @"
CITACOES PADRONIZADAS - SPEED FINANCEIRA E LAN HOUSE
Gerado em: $dataGeracao
Fonte: dados/nap.json

O que tem aqui:
  00_LEIA.txt                  este arquivo
  01_nap_completo.txt          bloco NAP para campo de descricao
  02_nap_curto.txt             NAP em uma linha
  03_descricao_150.txt         descricao curta (ate ~150 caracteres)
  04_descricao_400.txt         descricao media (ate ~400 caracteres)
  05_descricao_750.txt         descricao longa (ate ~750 caracteres)
  06_horario_pendente.txt      aviso de horario
  07_links_whatsapp.txt        links com codigo de origem
  08_checklist.txt             conferencia antes de enviar
  10_... a 17_...             uma ficha por diretorio novo
  citacoes.csv                 todos os campos em uma planilha

Regras:
  1. O horario continua PENDENTE. Nao preencher como definitivo antes da Decisao 2.
  2. Nao usar logo de INSS, Gov.br, Detran ou Governo Federal.
  3. Nao prometer aprovacao de credito.
  4. Registrar protocolo em 13_Protocolos.csv.
  5. Telefones banidos: (35) 3113-0458 e (35) 3067-4361.

Nada foi publicado. Nada foi enviado.
"@
Gravar-Utf8Bom -Caminho (Join-Path $saida '00_LEIA.txt') -Conteudo $leia
Gravar-Utf8Bom -Caminho (Join-Path $saida '01_nap_completo.txt') -Conteudo $blocoNap
Gravar-Utf8Bom -Caminho (Join-Path $saida '02_nap_curto.txt') -Conteudo $blocoNapCurto
Gravar-Utf8Bom -Caminho (Join-Path $saida '03_descricao_150.txt') -Conteudo $descCurta
Gravar-Utf8Bom -Caminho (Join-Path $saida '04_descricao_400.txt') -Conteudo $descMedia
Gravar-Utf8Bom -Caminho (Join-Path $saida '05_descricao_750.txt') -Conteudo $descLonga
Gravar-Utf8Bom -Caminho (Join-Path $saida '07_links_whatsapp.txt') -Conteudo $links

$horario = @"
HORARIO - PENDENTE DE DECISAO

O horario ainda nao foi aprovado pelo dono (03_Decisoes_Pendentes.md, Decisao 2).
Enquanto isso:
  - no Google, usar o horario real praticado pela loja;
  - nos diretorios, nao inventar: se o campo for obrigatorio, usar o mesmo do Google;
  - no site, nao publicar horario divergente.

Depois da aprovacao, este bloco sera atualizado e replicado em site, Google e fichas.
"@
Gravar-Utf8Bom -Caminho (Join-Path $saida '06_horario_pendente.txt') -Conteudo $horario

$checklist = @"
CONFERENCIA ANTES DE ENVIAR

[ ] Nome igual em todos os campos
[ ] Endereco: $logradouro, $numero - $bairro
[ ] CEP: $cep
[ ] Telefone: $tel
[ ] WhatsApp: $whats
[ ] Site: $site
[ ] E-mail: $email
[ ] Horario: somente o aprovado na Decisao 2
[ ] Nenhum telefone 3113-0458 ou 3067-4361
[ ] Nenhuma promessa de aprovacao de credito
[ ] Nenhum logo oficial de governo
[ ] Descricao dentro do limite do campo
[ ] Protocolo registrado em 13_Protocolos.csv
[ ] Print da ficha salvo na pasta da loja
[ ] Conferido em janela anonima depois de publicar
"@
Gravar-Utf8Bom -Caminho (Join-Path $saida '08_checklist.txt') -Conteudo $checklist

# ---- Fichas por diretorio ----
$plataformas = @(
  @{ Arquivo = '10_Reclame_Aqui.txt'; Nome = 'Reclame Aqui'; Descricao = $descMedia; Tam = 'media (400)'; Categoria = 'Correspondente bancario / Servicos financeiros'; Nota = 'Nao e diretorio; e reputacao. Cadastrar antes de precisar.' },
  @{ Arquivo = '11_Apontador.txt'; Nome = 'Apontador'; Descricao = $descMedia; Tam = 'media (400)'; Categoria = 'Correspondente bancario - Lan house'; Nota = 'Se ja existir ficha, reivindicar em vez de criar outra.' },
  @{ Arquivo = '12_Foursquare.txt'; Nome = 'Foursquare'; Descricao = $descCurta; Tam = 'curta (150)'; Categoria = 'Financial Service - Print Shop'; Nota = 'Categorias em ingles; escolher as duas.' },
  @{ Arquivo = '13_Hotfrog.txt'; Nome = 'Hotfrog'; Descricao = $descMedia; Tam = 'media (400)'; Categoria = 'Financial Services - Printing'; Nota = 'Ficha gratuita; conferir se nao criou duplicata.' },
  @{ Arquivo = '14_GuiaMais.txt'; Nome = 'GuiaMais'; Descricao = $descCurta; Tam = 'curta (150)'; Categoria = 'Correspondente bancario - Grafica'; Nota = 'Se so houver plano pago, registrar e nao contratar.' },
  @{ Arquivo = '15_Guia_Urbana.txt'; Nome = 'Guia Urbana'; Descricao = $descCurta; Tam = 'curta (150)'; Categoria = 'Servicos financeiros - Grafica'; Nota = 'Testar formulario; sem retorno em 7 dias, registrar como sem canal.' },
  @{ Arquivo = '16_Yelp.txt'; Nome = 'Yelp'; Descricao = $descCurta; Tam = 'curta (150)'; Categoria = 'Financial Services - Printing'; Nota = 'Volume local baixo; foco em autoridade, nao em impulsionar.' },
  @{ Arquivo = '17_InfoisInfo.txt'; Nome = 'InfoisInfo'; Descricao = $descCurta; Tam = 'curta (150)'; Categoria = 'Correspondente bancario'; Nota = 'Conferir se a ficha atual e da Speed; se for de terceiro, pedir remocao.' }
)

foreach ($p in $plataformas) {
  $conteudo = @"
FICHA: $($p.Nome)
Descricao: $($p.Tam)
Categoria sugerida: $($p.Categoria)
Observacao: $($p.Nota)

--- NAP (copiar igual) ---
$blocoNap

--- DESCRICAO ---
$($p.Descricao)

--- CAMPOS ---
Nome de exibicao: $nome
Nome alternativo: $nomeCurto
CNPJ: $cnpj
Endereco: $logradouro, $numero
Bairro: $bairro
Cidade/UF: $cidade / $uf
CEP: $cep
Telefone: $tel
WhatsApp: $whats
Site: $site
E-mail: $email
Horario: A CONFIRMAR (Decisao 2)

--- ANTES DE ENVIAR ---
[ ] Reivindicar ficha existente em vez de criar duplicata
[ ] Descricao dentro do limite do campo
[ ] Nenhum telefone banido
[ ] Nenhuma promessa de credito
[ ] Protocolo em 13_Protocolos.csv
[ ] Print salvo
"@
  Gravar-Utf8Bom -Caminho (Join-Path $saida $p.Arquivo) -Conteudo $conteudo
}

# ---- CSV unico ----
$linhasCsv = New-Object System.Collections.Generic.List[string]
$linhasCsv.Add((@('Campo', 'Conteudo', 'Limite', 'Observacao') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Nome de exibicao', $nome, 'conforme plataforma', 'pendente de aprovacao') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Nome curto', $nomeCurto, 'conforme plataforma', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('CNPJ', $cnpj, '18', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Endereco', $enderecoLinha, 'conforme plataforma', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Telefone', $tel, 'conforme plataforma', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('WhatsApp', $whats, 'URL', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('E-mail', $email, 'conforme plataforma', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Site', $site, 'URL', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Horario', 'A CONFIRMAR', 'conforme plataforma', 'Decisao 2 pendente') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Descricao curta', $descCurta, '150', "$($descCurta.Length) caracteres") | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Descricao media', $descMedia, '400', "$($descMedia.Length) caracteres") | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Descricao longa', $descLonga, '750', "$($descLonga.Length) caracteres") | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Categoria principal', 'Correspondente bancario', 'conforme plataforma', 'alternativa: Agencia de emprestimos') | ForEach-Object { Esc-Csv $_ }) -join ';')
$linhasCsv.Add((@('Categorias secundarias', 'Lan house - Servico de impressao - Grafica - Loja de informatica - Servico de copia', 'conforme plataforma', '') | ForEach-Object { Esc-Csv $_ }) -join ';')
Gravar-Utf8Bom -Caminho (Join-Path $saida 'citacoes.csv') -Conteudo ($linhasCsv -join "`r`n")

# ---- Validacao das paginas publicas ----
$arquivosPublicos = New-Object System.Collections.Generic.List[System.IO.FileInfo]
Get-ChildItem -LiteralPath $raiz -Filter '*.html' -File | Where-Object {
  $_.Name -like '06_*' -or $_.Name -like '07_*'
} | ForEach-Object { $arquivosPublicos.Add($_) }
if (Test-Path -LiteralPath $paginas) {
  Get-ChildItem -LiteralPath $paginas -Filter '*.html' -File | ForEach-Object { $arquivosPublicos.Add($_) }
}
$artigos = Join-Path $raiz 'artigos'
if (Test-Path -LiteralPath $artigos) {
  Get-ChildItem -LiteralPath $artigos -Filter '*.html' -File | ForEach-Object { $arquivosPublicos.Add($_) }
}

$relatorio = New-Object System.Collections.Generic.List[string]
$relatorio.Add("VALIDACAO DE CITACOES - $dataGeracao")
$relatorio.Add('Fonte de NAP: dados/nap.json')
$relatorio.Add("Arquivos publicos analisados: $($arquivosPublicos.Count)")
$relatorio.Add('')

$totalTelefone = 0
$totalEndereco = 0
$totalCep = 0
$totalNome = 0
$totalBanido = 0

foreach ($arquivo in $arquivosPublicos) {
  $texto = Get-Content -LiteralPath $arquivo.FullName -Raw -Encoding UTF8
  $faltas = New-Object System.Collections.Generic.List[string]

  if ($texto.Contains($tel)) { $totalTelefone++ } else { $faltas.Add('telefone correto ausente') }
  if ($texto.Contains($logradouro) -and $texto.Contains($numero)) { $totalEndereco++ } else { $faltas.Add('endereco ausente') }
  if ($texto.Contains($cep)) { $totalCep++ } else { $faltas.Add('CEP ausente') }
  if ($texto.Contains($nome) -or $texto.Contains($nomeCurto)) { $totalNome++ } else { $faltas.Add('nome ausente') }

  $banidos = @('3113-0458', '3067-4361')
  foreach ($b in $banidos) {
    if ($texto.Contains($b)) {
      $faltas.Add("TELEFONE BANIDO: $b")
      $totalBanido++
    }
  }

  if ($texto -match '6969') { $faltas.Add('numero 6969 encontrado') }

  $nomeRel = $arquivo.FullName.Substring($raiz.Length).TrimStart('\')
  if ($faltas.Count -eq 0) {
    $relatorio.Add("[OK] $nomeRel")
  } else {
    $relatorio.Add("[ATENCAO] $nomeRel")
    foreach ($f in $faltas) { $relatorio.Add("   - $f") }
  }
}

$relatorio.Add('')
$relatorio.Add('=== TOTAIS ===')
$relatorio.Add("Telefone correto: $totalTelefone de $($arquivosPublicos.Count)")
$relatorio.Add("Endereco correto: $totalEndereco de $($arquivosPublicos.Count)")
$relatorio.Add("CEP correto: $totalCep de $($arquivosPublicos.Count)")
$relatorio.Add("Nome presente: $totalNome de $($arquivosPublicos.Count)")
$relatorio.Add("Ocorrencias de telefone banido: $totalBanido")
$relatorio.Add('')
$relatorio.Add('Observacao: paginas de ferramenta (12, 21 a 24, 27, 29 e 32) nao entram nesta validacao porque nao sao publicas.')
$relatorio.Add('Cobertura: LPs 06 e 07, paginas/ (9) e artigos/ (5).')
$relatorio.Add('Nada foi publicado. Nada foi alterado nas paginas.')

Gravar-Utf8Bom -Caminho (Join-Path $dados 'validacao_citacoes.txt') -Conteudo ($relatorio -join "`r`n")

# ---- Resumo no console ----
Write-Host ''
Write-Host '=== CITACOES GERADAS ===' -ForegroundColor Green
Write-Host "Pasta: $saida"
Write-Host "Fichas por diretorio: $($plataformas.Count)"
Write-Host "Descricoes: curta $($descCurta.Length) / media $($descMedia.Length) / longa $($descLonga.Length) caracteres"
Write-Host ''
Write-Host '=== VALIDACAO ===' -ForegroundColor Green
Write-Host "Paginas publicas: $($arquivosPublicos.Count)"
Write-Host "Telefone correto: $totalTelefone / $($arquivosPublicos.Count)"
Write-Host "Endereco correto: $totalEndereco / $($arquivosPublicos.Count)"
Write-Host "CEP correto: $totalCep / $($arquivosPublicos.Count)"
Write-Host "Nome presente: $totalNome / $($arquivosPublicos.Count)"
Write-Host "Telefones banidos encontrados: $totalBanido"
Write-Host ''
Write-Host 'Relatorio: dados\validacao_citacoes.txt'
Write-Host 'Nada foi publicado.'
