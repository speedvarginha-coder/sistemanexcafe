' Tarefa Nexcafe-Marketing-Sync: roda a sincronizacao do marketing sem abrir janela de console.
Set fso = CreateObject("Scripting.FileSystemObject")
script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "marketing-sync.js")
WScript.Quit CreateObject("WScript.Shell").Run("""C:\Program Files\nodejs\node.exe"" """ & script & """", 0, True)
