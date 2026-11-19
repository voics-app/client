/** Development Electron otherwise replaces the installed app's system link association. */
export function shouldRegisterProtocol(isPackaged: boolean, devOptIn: string | undefined): boolean {
  return isPackaged || devOptIn === '1';
}
