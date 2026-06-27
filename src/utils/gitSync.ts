import LightningFS from '@isomorphic-git/lightning-fs'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import type { AppSettings, DiaryEntry } from '../domain/types'
import {
  DIARY_CATALOG_FILE_NAME,
  WEATHER_CODES_FILE_NAME,
  deserializeDiaryCatalog,
  serializeDiaryCatalog,
  serializeWeatherCodes,
} from '../domain/diaryCatalog'
import {
  deserializeDiaryEntryMarkdown,
  serializeDiaryEntryMarkdown,
} from '../domain/diaryEntrySerialization'
import {
  getEntryNasMarkdownFileName,
} from './files'

const gitFsName = 'lfx-diary-git-v1'
const repoDir = '/repo'

let gitFs: LightningFS | null = null

export class GitSyncError extends Error {
  operation: string
  originalMessage?: string

  constructor(message: string, operation: string, originalMessage?: string) {
    super(message)
    this.name = 'GitSyncError'
    this.operation = operation
    this.originalMessage = originalMessage
  }
}

export async function pushEntriesToGit(entries: DiaryEntry[], settings: AppSettings, catalogEntries: DiaryEntry[]) {
  if (!entries.length)
    return

  const fs = await ensureGitRepository(settings)

  await pullGit(fs, settings, true)

  const filepaths: string[] = []

  for (const entry of entries) {
    const filepath = getEntryGitMarkdownPath(settings, entry)
    await writeRepoFile(fs, filepath, serializeDiaryEntryMarkdown(entry))
    filepaths.push(filepath)
  }

  const catalogPath = joinGitPath(settings.gitDiaryPath, DIARY_CATALOG_FILE_NAME)
  const weatherCodesPath = joinGitPath(settings.gitDiaryPath, WEATHER_CODES_FILE_NAME)
  await writeRepoFile(fs, catalogPath, serializeDiaryCatalog(catalogEntries))
  await writeRepoFile(fs, weatherCodesPath, serializeWeatherCodes())
  filepaths.push(catalogPath, weatherCodesPath)

  for (const filepath of filepaths)
    await git.add({ fs, dir: repoDir, filepath })

  if (!(await hasStagedChanges(fs)))
    return

  await git.commit({
    fs,
    dir: repoDir,
    message: `Update diary entries: ${entries.map((entry) => entry.diaryDate).join(', ')}`,
    author: getGitAuthor(settings),
  })

  await runGitOperation('push', () =>
    git.push({
      fs,
      http,
      dir: repoDir,
      remote: 'origin',
      ref: settings.gitBranch,
      corsProxy: settings.gitCorsProxy || undefined,
      onAuth: () => getGitAuth(settings),
    }),
  )
}

export async function pullEntriesFromGit(settings: AppSettings): Promise<DiaryEntry[]> {
  const fs = await ensureGitRepository(settings)
  await pullGit(fs, settings, false)

  const catalog = await readOptionalRepoFile(fs, joinGitPath(settings.gitDiaryPath, DIARY_CATALOG_FILE_NAME))
    .then((raw) => raw ? deserializeDiaryCatalog(raw) ?? undefined : undefined)
  const markdownFiles = await listMarkdownFiles(fs, settings.gitDiaryPath)
  const entries = await Promise.all(
    markdownFiles.map(async (filepath) =>
      deserializeDiaryEntryMarkdown(await readRepoFile(fs, filepath), getBaseName(filepath), catalog),
    ),
  )

  return entries.filter((entry): entry is DiaryEntry => Boolean(entry))
}

export async function deleteEntryFromGit(entry: DiaryEntry, settings: AppSettings, catalogEntries: DiaryEntry[]) {
  const fs = await ensureGitRepository(settings)
  await pullGit(fs, settings, true)

  const entryPath = getEntryGitMarkdownPath(settings, entry)
  await deleteRepoFile(fs, entryPath)

  const catalogPath = joinGitPath(settings.gitDiaryPath, DIARY_CATALOG_FILE_NAME)
  const weatherCodesPath = joinGitPath(settings.gitDiaryPath, WEATHER_CODES_FILE_NAME)
  await writeRepoFile(fs, catalogPath, serializeDiaryCatalog(catalogEntries))
  await writeRepoFile(fs, weatherCodesPath, serializeWeatherCodes())

  await git.add({ fs, dir: repoDir, filepath: catalogPath })
  await git.add({ fs, dir: repoDir, filepath: weatherCodesPath })

  if (!(await hasStagedChanges(fs)))
    return

  await git.commit({
    fs,
    dir: repoDir,
    message: `Delete diary entry: ${entry.diaryDate}`,
    author: getGitAuthor(settings),
  })

  await runGitOperation('push', () =>
    git.push({
      fs,
      http,
      dir: repoDir,
      remote: 'origin',
      ref: settings.gitBranch,
      corsProxy: settings.gitCorsProxy || undefined,
      onAuth: () => getGitAuth(settings),
    }),
  )
}

export function getGitDisplayTarget(settings: AppSettings): string {
  return `${settings.gitRemoteUrl || 'Unconfigured Git remote'}#${settings.gitBranch || 'main'}`
}

export function getEntryGitMarkdownPath(settings: AppSettings, entry: DiaryEntry): string {
  const [year, month] = entry.diaryDate.split('-')

  return joinGitPath(settings.gitDiaryPath, year, month, getEntryNasMarkdownFileName(entry))
}

async function ensureGitRepository(settings: AppSettings): Promise<LightningFS> {
  validateGitSettings(settings)

  const fs = getGitFs()
  await ensureDirectory(fs, repoDir)

  if (await isGitRepository(fs)) {
    await configureRemote(fs, settings)
    return fs
  }

  try {
    await runGitOperation('clone', () =>
      git.clone({
        fs,
        http,
        dir: repoDir,
        url: settings.gitRemoteUrl,
        ref: settings.gitBranch,
        singleBranch: true,
        depth: 1,
        corsProxy: settings.gitCorsProxy || undefined,
        onAuth: () => getGitAuth(settings),
      }),
    )
  } catch {
    await runGitOperation('init', () => git.init({ fs, dir: repoDir, defaultBranch: settings.gitBranch }))
  }

  await configureRemote(fs, settings)
  return fs
}

async function configureRemote(fs: LightningFS, settings: AppSettings) {
  await git.setConfig({ fs, dir: repoDir, path: 'remote.origin.url', value: settings.gitRemoteUrl })
  await git.setConfig({ fs, dir: repoDir, path: 'branch.' + settings.gitBranch + '.remote', value: 'origin' })
  await git.setConfig({ fs, dir: repoDir, path: 'branch.' + settings.gitBranch + '.merge', value: `refs/heads/${settings.gitBranch}` })
}

async function pullGit(fs: LightningFS, settings: AppSettings, allowEmptyRemote: boolean) {
  try {
    await runGitOperation('pull', () =>
      git.pull({
        fs,
        http,
        dir: repoDir,
        ref: settings.gitBranch,
        singleBranch: true,
        corsProxy: settings.gitCorsProxy || undefined,
        author: getGitAuthor(settings),
        onAuth: () => getGitAuth(settings),
      }),
    )
  } catch (error) {
    if (allowEmptyRemote && isLikelyEmptyRemoteError(error))
      return

    throw error
  }
}

async function hasStagedChanges(fs: LightningFS): Promise<boolean> {
  const matrix = await git.statusMatrix({ fs, dir: repoDir })

  return matrix.some(([, head, , stage]) => head !== stage)
}

async function isGitRepository(fs: LightningFS): Promise<boolean> {
  try {
    await fs.promises.stat(joinAbsolutePath(repoDir, '.git'))
    return true
  } catch {
    return false
  }
}

function getGitFs(): LightningFS {
  gitFs ??= new LightningFS(gitFsName)

  return gitFs
}

function validateGitSettings(settings: AppSettings) {
  if (!settings.gitRemoteUrl)
    throw new GitSyncError('Enter a Git remote URL in Settings first.', 'validate')

  if (!settings.gitBranch)
    throw new GitSyncError('Enter a Git branch in Settings first.', 'validate')
}

function getGitAuth(settings: AppSettings): { username?: string; password?: string } | undefined {
  if (!settings.gitUsername && !settings.gitPassword)
    return undefined

  return {
    username: settings.gitUsername,
    password: settings.gitPassword,
  }
}

function getGitAuthor(settings: AppSettings): { name: string; email: string } {
  return {
    name: settings.gitAuthorName || settings.gitUsername || 'Diary Book',
    email: settings.gitAuthorEmail || 'lfx-diary@example.local',
  }
}

async function runGitOperation<T>(operation: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw new GitSyncError(
      error instanceof Error ? error.message : `Git ${operation} failed.`,
      operation,
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function writeRepoFile(fs: LightningFS, filepath: string, content: string) {
  await ensureParentDirectory(fs, filepath)
  await fs.promises.writeFile(joinAbsolutePath(repoDir, filepath), content, 'utf8')
}

async function readRepoFile(fs: LightningFS, filepath: string): Promise<string> {
  return fs.promises.readFile(joinAbsolutePath(repoDir, filepath), 'utf8')
}

async function readOptionalRepoFile(fs: LightningFS, filepath: string): Promise<string | null> {
  try {
    return await readRepoFile(fs, filepath)
  } catch {
    return null
  }
}

async function deleteRepoFile(fs: LightningFS, filepath: string) {
  try {
    await git.remove({ fs, dir: repoDir, filepath })
    return
  } catch {
    // The file may be untracked or already missing from the repo index.
  }

  try {
    await fs.promises.unlink(joinAbsolutePath(repoDir, filepath))
  } catch {
    // A missing remote file should not block local deletion; catalog updates still matter.
  }
}

async function listMarkdownFiles(fs: LightningFS, basePath: string): Promise<string[]> {
  const normalizedBasePath = normalizeGitPath(basePath)
  const absoluteBasePath = joinAbsolutePath(repoDir, normalizedBasePath)

  try {
    await fs.promises.stat(absoluteBasePath)
  } catch {
    return []
  }

  return listMarkdownFilesRecursive(fs, normalizedBasePath)
}

async function listMarkdownFilesRecursive(fs: LightningFS, folder: string): Promise<string[]> {
  const names = await fs.promises.readdir(joinAbsolutePath(repoDir, folder))
  const files: string[] = []

  for (const name of names) {
    const filepath = joinGitPath(folder, name)
    const stat = await fs.promises.stat(joinAbsolutePath(repoDir, filepath))

    if (stat.isDirectory()) {
      files.push(...await listMarkdownFilesRecursive(fs, filepath))
    } else if (name.toLowerCase().endsWith('.md')) {
      files.push(filepath)
    }
  }

  return files
}

async function ensureParentDirectory(fs: LightningFS, filepath: string) {
  const parts = filepath.split('/').slice(0, -1)

  if (!parts.length)
    return

  await ensureDirectory(fs, joinAbsolutePath(repoDir, ...parts))
}

async function ensureDirectory(fs: LightningFS, absolutePath: string) {
  const parts = absolutePath.split('/').filter(Boolean)
  let current = ''

  for (const part of parts) {
    current += `/${part}`

    try {
      await fs.promises.mkdir(current)
    } catch {
      // Existing directories are fine; LightningFS does not support recursive mkdir everywhere.
    }
  }
}

function isLikelyEmptyRemoteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  return message.includes('could not find') || message.includes('not found') || message.includes('empty')
}

function joinGitPath(...parts: string[]): string {
  return parts
    .map(normalizeGitPath)
    .filter(Boolean)
    .join('/')
}

function joinAbsolutePath(...parts: string[]): string {
  return `/${joinGitPath(...parts)}`
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function getBaseName(filepath: string): string {
  return filepath.split('/').pop() ?? filepath
}
