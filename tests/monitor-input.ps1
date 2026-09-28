param([string]$AgentFile)
$ErrorActionPreference = "Stop"
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($AgentFile, [ref]$null, [ref]$errors)
if ($errors.Count) { throw "Agente com erro de sintaxe: $($errors[0].Message)" }
$function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Add-LhmInputTypes" }, $true)
if (-not $function) { throw "Rotina de entrada remota ausente" }
Invoke-Expression $function.Extent.Text
Add-LhmInputTypes
$expected = if ([IntPtr]::Size -eq 8) { 40 } else { 28 }
if ([LhmInput]::InputSize() -ne $expected) { throw "Estrutura SendInput incompatível com Windows: $([LhmInput]::InputSize()) bytes; esperado $expected" }
"Entrada remota: estrutura SendInput valida ($expected bytes)"
