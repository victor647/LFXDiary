Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

packagingDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(packagingDir)
shell.CurrentDirectory = projectDir
shell.Run "node packaging\scripts\stop-browser-dev.cjs", 0, False
