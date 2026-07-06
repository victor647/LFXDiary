import type { AppSettings, DiaryEntry } from '../domain/types'
import { getEntryMarkdownFolder } from '../utils/files'
import {
  deleteEntryFromGit,
  getGitDisplayTarget,
  pullEntriesFromGit,
  pushEntriesToGit,
} from '../utils/gitSync'
import {
  deleteEntryFromSynology,
  downloadEntriesFromSynology,
  uploadEntriesToSynology,
} from '../utils/synology'

export type DiarySyncAdapter = {
  label: string
  pushEntries: (entries: DiaryEntry[], settings: AppSettings, catalogEntries: DiaryEntry[]) => Promise<void>
  pullEntries: (settings: AppSettings) => Promise<DiaryEntry[]>
  deleteEntry: (entry: DiaryEntry, settings: AppSettings, catalogEntries: DiaryEntry[]) => Promise<void>
  getPullSource: (settings: AppSettings) => string
  getPushDestination: (settings: AppSettings, entry: DiaryEntry) => string
}

const gitSyncAdapter: DiarySyncAdapter = {
  label: 'Git',
  pushEntries: pushEntriesToGit,
  pullEntries: pullEntriesFromGit,
  deleteEntry: deleteEntryFromGit,
  getPullSource: getGitDisplayTarget,
  getPushDestination: getGitDisplayTarget,
}

const nasSyncAdapter: DiarySyncAdapter = {
  label: 'NAS',
  pushEntries: uploadEntriesToSynology,
  pullEntries: downloadEntriesFromSynology,
  deleteEntry: deleteEntryFromSynology,
  getPullSource: (settings) => settings.markdownFolder,
  getPushDestination: (settings, entry) => getEntryMarkdownFolder(settings.markdownFolder, entry),
}

export function getDiarySyncAdapter(settings: AppSettings): DiarySyncAdapter {
  return settings.syncProvider === 'git' ? gitSyncAdapter : nasSyncAdapter
}
