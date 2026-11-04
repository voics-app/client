; Custom NSIS pieces for the Voics installer (electron-builder nsis.include).
; Brand-agnostic: every folder name below comes from electron-builder's defines, which come from
; brand.json (productName) and package.json (name), never from literals in this file.
;
; Uninstall behaviour for user data:
;   - interactive uninstall: an extra page with two choices, "Keep my data" (selected) and "Remove everything"
;   - silent uninstall (/S): data is kept, unless the uninstaller is started with /DELETEDATA
;   - auto-update (electron-updater runs the old uninstaller with --updated): data is always kept
; Only these folders are ever removed, nothing else outside the install dir:
;   %APPDATA%\<productName>                 (local message store, E2EE keys, settings, logs, caches)
;   %LOCALAPPDATA%\<package name>-updater   (downloaded update installers)

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!insertmacro un.WordReplace

Var AppDeleteData
Var AppKeepDataRadio
Var AppRemoveDataRadio

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.dataChoicePage un.dataChoicePageLeave
!macroend

Function un.dataChoicePage
  ; Nothing to ask during silent uninstalls or when the app updates itself.
  ${If} ${Silent}
    Abort
  ${EndIf}
  ClearErrors
  ${GetParameters} $R8
  ${GetOptions} $R8 "--updated" $R9
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 12u "What should happen to your data on this computer?"
  Pop $0
  ${NSD_CreateRadioButton} 0 16u 100% 12u "Keep my data"
  Pop $AppKeepDataRadio
  ${NSD_CreateLabel} 12u 29u 95% 20u "Removes the app only. Your settings and saved messages stay on this computer, so everything is back if you reinstall."
  Pop $0
  ${NSD_CreateRadioButton} 0 54u 100% 12u "Remove everything"
  Pop $AppRemoveDataRadio
  ${NSD_CreateLabel} 12u 67u 95% 32u "Also deletes your settings, saved messages and encryption keys from this computer. Encrypted messages that only these keys can open can't be recovered. Your ${PRODUCT_NAME} account is not deleted."
  Pop $0
  ${NSD_Check} $AppKeepDataRadio
  nsDialogs::Show
FunctionEnd

Function un.dataChoicePageLeave
  ${NSD_GetState} $AppRemoveDataRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $AppDeleteData "1"
  ${EndIf}
FunctionEnd

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ; Silent / scripted opt-in: Setup uninstaller started with /DELETEDATA (or electron-builder's --delete-app-data).
    ClearErrors
    ${GetParameters} $R8
    ${GetOptions} $R8 "/DELETEDATA" $R9
    ${IfNot} ${Errors}
      StrCpy $AppDeleteData "1"
    ${EndIf}
    ${If} $AppDeleteData == "1"
      ; Electron always uses the per-user profile, even for all-users installs.
      SetShellVarContext current
      ${If} "${PRODUCT_FILENAME}" != ""
        RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
      ${EndIf}
      ${If} "${APP_FILENAME}" != ""
        RMDir /r "$APPDATA\${APP_FILENAME}"
      ${EndIf}
      ; electron-builder names the updater cache from the package name with "/" removed
      ; ("@scope/name" -> "@scopename-updater"); the NSIS define keeps the "\" separator.
      !ifdef APP_PACKAGE_NAME
        ${un.WordReplace} "${APP_PACKAGE_NAME}" "\" "" "+" $R7
        ${If} $R7 != ""
          RMDir /r "$LOCALAPPDATA\$R7-updater"
        ${EndIf}
      !endif
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
