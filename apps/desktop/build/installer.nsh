; Custom NSIS pieces for the Voics installer (electron-builder nsis.include).
; Brand-agnostic: every folder name below comes from electron-builder's defines, which come from
; brand.json (productName) and package.json (name), never from literals in this file.
;
; Uninstall behaviour for user data:
;   - interactive uninstall: an extra page with an UNCHECKED "Also delete my <product> data" checkbox
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

Var DiscordyDeleteData
Var DiscordyDeleteCheckbox

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.discordyDataPage un.discordyDataPageLeave
!macroend

Function un.discordyDataPage
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
  ${NSD_CreateLabel} 0 0 100% 24u "Uninstalling ${PRODUCT_NAME} removes the app but keeps your data (settings, local message store, encryption keys, logs) so a reinstall picks up where you left off."
  Pop $0
  ${NSD_CreateCheckbox} 0 40u 100% 12u "Also delete my ${PRODUCT_NAME} data"
  Pop $DiscordyDeleteCheckbox
  ${NSD_CreateLabel} 12u 56u 95% 36u "This permanently removes everything ${PRODUCT_NAME} stored on this computer, including local encryption keys. Messages in encrypted conversations that are only readable with those keys cannot be recovered afterwards."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function un.discordyDataPageLeave
  ${NSD_GetState} $DiscordyDeleteCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DiscordyDeleteData "1"
  ${EndIf}
FunctionEnd

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ; Silent / scripted opt-in: Setup uninstaller started with /DELETEDATA (or electron-builder's --delete-app-data).
    ClearErrors
    ${GetParameters} $R8
    ${GetOptions} $R8 "/DELETEDATA" $R9
    ${IfNot} ${Errors}
      StrCpy $DiscordyDeleteData "1"
    ${EndIf}
    ${If} $DiscordyDeleteData == "1"
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
