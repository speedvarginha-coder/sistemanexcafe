# Correção da tela de bloqueio presa — 22/10/2026

## Sintoma

A Máquina 11 aparecia "EM USO" no painel, com cronômetro correndo e valor acumulando, enquanto o cliente continuava diante da tela azul de bloqueio. O servidor tinha `locked: false`, sessão aberta às 11:20:09 e o próprio agente havia confirmado a abertura 2 segundos depois ("Acesso liberado — sessão aberta na estação"). Ou seja, servidor e agente concordavam que a estação estava liberada; só a janela de bloqueio não saiu da frente.

O atendente precisou liberar a Máquina 14 para o cliente. A sessão fantasma da 11 seguiu contando por 40 minutos e foi encerrada com desconto total de R$ 4,50.

## Causa

A tela de bloqueio roda como processo separado (`client-agent/LanHouseAgent.ps1`, `Invoke-LockScreen`). O laço principal do agente só sabia **abri-la**; não havia nenhum caminho que a fechasse. O fechamento dependia inteiramente de ela se encerrar sozinha, por um timer interno de 1 segundo que consulta o servidor e fecha as janelas quando `locked` vira false.

Dois defeitos derrubavam esse timer e deixavam a tela presa para sempre:

1. **`LoginBusy` travado.** O tick começa com `if ($script:LoginBusy) { return }`. No login bem-sucedido do cliente a flag virava `true` e nunca voltava a `false`. Pior: o mesmo bloco chamava `$script:Timer.Stop()` **antes** de fechar as janelas. Qualquer falha entre parar o timer e fechar os formulários deixava timer parado, flag travada e tela eterna.

2. **Processo órfão protegido pelo mutex.** `Invoke-LockScreen` usa o mutex `Local\LanHouseManagerLockScreen` e desiste na hora se já existir uma instância. Com uma tela presa, nenhuma nova nascia para corrigir a situação, e o laço principal considerava tudo certo porque a variável `$lockProcess` ainda apontava para um processo vivo.

O gatilho provável no caso real foi a sequência encerrar → restaurar → liberar em 4 segundos (11:19:58, 11:20:07, 11:20:09).

## Correção

### 1. O laço principal passa a fechar a tela (`client-agent/LanHouseAgent.ps1:2111`)

```powershell
} elseif ($lockProcess -and -not $lockProcess.HasExited) {
    Write-AgentLog "Estacao liberada com a tela de bloqueio ainda aberta; fechando."
    Stop-AgentUiProcesses -Actions @("LockScreen")
    $lockProcess = $null
}
```

O servidor é a autoridade: se respondeu `locked:false` e ainda existe tela de bloqueio viva, ela é encerrada. Isso cobre qualquer causa de travamento, inclusive as não mapeadas, porque atua na única camada que conhece o estado real. `Stop-AgentUiProcesses` mata por linha de comando, então alcança também processos órfãos que `$lockProcess` não rastreia.

### 2. O login não derruba mais as próprias defesas (`client-agent/LanHouseAgent.ps1:2747`)

Removido o `$script:Timer.Stop()` do caminho de sucesso e o reset de `LoginBusy` movido para um bloco `finally`. O timer segue rodando de propósito: se os `Close()` falharem, é ele quem fecha a tela no tick seguinte, ao ver `locked:false`.

## Verificação

- Parser do PowerShell sem erros (`[Parser]::ParseFile`).
- `npm test`: 51 testes, 51 passando.
- Distribuição automática confirmada pelos eventos: as seis estações online reiniciaram os agentes entre 11:46:40 e 11:48:01, após o servidor detectar o novo hash do script (`server/app.js:213`, cache invalidado por mtime). Nada precisou ser reinstalado.

**O que não está comprovado:** a correção só será exercitada de fato no próximo encerrar-e-liberar em sequência rápida. Se o bug voltar a ocorrer e for neutralizado, o log da estação registra `Estacao liberada com a tela de bloqueio ainda aberta; fechando.` — essa linha é o sinal de que o caminho novo entrou em ação.

Backup do script anterior: `client-agent/LanHouseAgent.ps1.bak-antes-fix-lock`.

## Pendência relacionada

A Máquina 11 continua registrada com o ID `tempname`, herdado do hostname padrão do Windows, e carrega `commandSeq` em 1198 contra 16–60 das demais estações, além de um `rejectedAt` de 25/09. É a mesma divergência apontada no item 10 da auditoria de 26/09 (`docs/AUDITORIA-2026-09-26.md`). Renomear a estação e refazer o vínculo do agente elimina o risco de colisão com outra máquina instalada com o mesmo nome padrão.
