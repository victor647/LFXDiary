export {}

declare global {
  interface Window {
    electronAPI?: {
      readFile: (filename: string) => Promise<string | null>
      writeFile: (filename: string, data: string) => Promise<boolean>
      getDataFolder: () => Promise<string>
      pickDataFolder: () => Promise<string>
    }
  }
}
