!macro customInit
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  StrCmp $0 "" 0 lfxDiaryInstallFound

  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  StrCmp $0 "" lfxDiaryInstallCheckDone lfxDiaryInstallFound

  lfxDiaryInstallFound:
    MessageBox MB_YESNO|MB_ICONQUESTION "Diary Book is already installed at:$\r$\n$0$\r$\n$\r$\nContinue to overwrite this installation? If you choose a different folder, the previous installation will be uninstalled first." IDYES lfxDiaryInstallCheckDone
    Abort

  lfxDiaryInstallCheckDone:
!macroend
