import type { AppSettings, DiaryCatalog, DiaryEntry } from '../domain/types'
import { getEntryMarkdownFolder, getNotebookMarkdownFolder } from '../utils/files'

export type DiarySyncProgressCallback = (current: number, total: number, label?: string) => void

export type DiarySyncAdapter = {
  label: string
  pushEntries: (entries: DiaryEntry[], settings: AppSettings, catalogEntries: DiaryEntry[], onProgress?: DiarySyncProgressCallback) => Promise<void>
  pullEntries: (settings: AppSettings, notebookKey?: string, onProgress?: DiarySyncProgressCallback) => Promise<DiaryEntry[]>
  pullNotebookEntries: (settings: AppSettings, notebookKeys: string[], onProgress?: DiarySyncProgressCallback) => Promise<DiaryEntry[]>
  deleteEntry: (entry: DiaryEntry, settings: AppSettings, catalogEntries: DiaryEntry[]) => Promise<void>
  pushCatalog: (catalog: DiaryCatalog, settings: AppSettings, onProgress?: DiarySyncProgressCallback) => Promise<void>
  getPullSource: (settings: AppSettings, notebookKey?: string) => string
  getPushDestination: (settings: AppSettings, entry: DiaryEntry) => string
}

async function getGitSyncAdapter(): Promise<DiarySyncAdapter> {
  const gitSync = await import('../utils/gitSync')

  return {
    label: 'Git',
    pushEntries: gitSync.pushEntriesToGit,
    pullEntries: gitSync.pullEntriesFromGit,
    pullNotebookEntries: gitSync.pullNotebookEntriesFromGit,
    deleteEntry: gitSync.deleteEntryFromGit,
    pushCatalog: gitSync.pushDiaryCatalogToGit,
    getPullSource: gitSync.getGitDisplayTarget,
    getPushDestination: gitSync.getGitDisplayTarget,
  }
}

async function getNasSyncAdapter(): Promise<DiarySyncAdapter> {
  const synology = await import('../utils/synology')

  return {
    label: 'NAS',
    pushEntries: synology.uploadEntriesToSynology,
    pullEntries: synology.downloadEntriesFromSynology,
    pullNotebookEntries: synology.downloadNotebookEntriesFromSynology,
    deleteEntry: synology.deleteEntryFromSynology,
    pushCatalog: synology.uploadDiaryCatalogToSynology,
    getPullSource: (settings, notebookKey) => notebookKey ? getNotebookMarkdownFolder(settings.markdownFolder, notebookKey) : settings.markdownFolder,
    getPushDestination: (settings, entry) => getEntryMarkdownFolder(settings.markdownFolder, entry),
  }
}

export function getDiarySyncAdapter(settings: AppSettings): Promise<DiarySyncAdapter> {
  return settings.syncProvider === 'git' ? getGitSyncAdapter() : getNasSyncAdapter()
}
