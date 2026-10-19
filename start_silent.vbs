Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Projeckt\harajat bot"
WshShell.Run "node src/server.js", 0, False
