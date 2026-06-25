import { ArrowLeft, GitBranch, HardDrive, Network, Save } from 'lucide-react'
import type { AppSettings } from '../domain/types'
import { getActiveNasUrl } from '../utils/settings'

type SettingsPageProps = {
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  onSave: () => void
  onBack: () => void
}

export function SettingsPage({ settings, onSettingsChange, onSave, onBack }: SettingsPageProps) {
  const activeNasUrl = getActiveNasUrl(settings)
  const isNasSync = settings.syncProvider === 'nas'
  const isGitSync = settings.syncProvider === 'git'

  return (
    <section className="settings-page">
      <div className="settings-header">
        <button type="button" className="settings-back-button" onClick={onBack} title="Back to diary">
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <h2>Settings</h2>
          <p>Markdown diary storage and sync provider.</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <HardDrive size={16} />
          Sync Provider
        </div>
        <div className="settings-mode-control">
          <button
            className={isNasSync ? 'selected' : ''}
            type="button"
            onClick={() => onSettingsChange({ ...settings, syncProvider: 'nas' })}
          >
            NAS
          </button>
          <button
            className={isGitSync ? 'selected' : ''}
            type="button"
            onClick={() => onSettingsChange({ ...settings, syncProvider: 'git' })}
          >
            Git
          </button>
        </div>
      </div>

      {isNasSync && (
        <div className="settings-section">
          <div className="settings-section-title">
            <Network size={16} />
            NAS Connection
          </div>
          <div className="settings-mode-control">
            <button
              className={settings.nasMode === 'lan' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, nasMode: 'lan' })}
            >
              LAN
            </button>
            <button
              className={settings.nasMode === 'public' ? 'selected' : ''}
              type="button"
              onClick={() => onSettingsChange({ ...settings, nasMode: 'public' })}
            >
              Public
            </button>
          </div>
          <label>
            Username
            <input
              value={settings.nasUsername}
              onChange={(event) => onSettingsChange({ ...settings, nasUsername: event.target.value })}
              placeholder="DSM username"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              value={settings.nasPassword}
              onChange={(event) => onSettingsChange({ ...settings, nasPassword: event.target.value })}
              placeholder="DSM password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            LAN NAS Address
            <input
              value={settings.lanNasUrl}
              onChange={(event) => onSettingsChange({ ...settings, lanNasUrl: event.target.value })}
              placeholder="https://192.168.0.2:5001/"
            />
          </label>
          <label>
            Public NAS Address
            <input
              value={settings.publicNasUrl}
              onChange={(event) => onSettingsChange({ ...settings, publicNasUrl: event.target.value })}
              placeholder="https://lafaxi647.cn:5001/"
            />
          </label>
        </div>
      )}

      {isGitSync && (
        <div className="settings-section">
          <div className="settings-section-title">
            <GitBranch size={16} />
            Git Repository
          </div>
          <label>
            Remote URL
            <input
              value={settings.gitRemoteUrl}
              onChange={(event) => onSettingsChange({ ...settings, gitRemoteUrl: event.target.value })}
              placeholder="https://github.com/user/diary.git"
            />
          </label>
          <label>
            Branch
            <input
              value={settings.gitBranch}
              onChange={(event) => onSettingsChange({ ...settings, gitBranch: event.target.value })}
              placeholder="main"
            />
          </label>
          <label>
            Username
            <input
              value={settings.gitUsername}
              onChange={(event) => onSettingsChange({ ...settings, gitUsername: event.target.value })}
              placeholder="Git username"
              autoComplete="username"
            />
          </label>
          <label>
            Password or Token
            <input
              value={settings.gitPassword}
              onChange={(event) => onSettingsChange({ ...settings, gitPassword: event.target.value })}
              placeholder="Personal access token"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label>
            Author Name
            <input
              value={settings.gitAuthorName}
              onChange={(event) => onSettingsChange({ ...settings, gitAuthorName: event.target.value })}
              placeholder="Diary"
            />
          </label>
          <label>
            Author Email
            <input
              value={settings.gitAuthorEmail}
              onChange={(event) => onSettingsChange({ ...settings, gitAuthorEmail: event.target.value })}
              placeholder="diary@example.com"
            />
          </label>
          <label>
            Repo Folder
            <input
              value={settings.gitDiaryPath}
              onChange={(event) => onSettingsChange({ ...settings, gitDiaryPath: event.target.value })}
              placeholder="Diary"
            />
          </label>
          <label>
            CORS Proxy
            <input
              value={settings.gitCorsProxy}
              onChange={(event) => onSettingsChange({ ...settings, gitCorsProxy: event.target.value })}
              placeholder="Optional, e.g. https://cors.isomorphic-git.org"
            />
          </label>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          <HardDrive size={16} />
          Markdown Storage
        </div>
        {isNasSync && (
          <label>
            NAS Folder
            <input
              value={settings.markdownFolder}
              onChange={(event) => onSettingsChange({ ...settings, markdownFolder: event.target.value })}
              placeholder="/home/Documents/Diary"
            />
          </label>
        )}
        <div className="settings-preview">
          <span>Provider</span>
          <strong>{isGitSync ? 'Git' : 'Synology NAS'}</strong>
          {isNasSync && (
            <>
              <span>Active NAS</span>
              <strong>{activeNasUrl}</strong>
            </>
          )}
          {isGitSync && (
            <>
              <span>Remote</span>
              <strong>{settings.gitRemoteUrl || 'Not configured'}</strong>
              <span>Branch</span>
              <strong>{settings.gitBranch || 'main'}</strong>
              <span>Repo folder</span>
              <strong>{settings.gitDiaryPath || 'Diary'}</strong>
            </>
          )}
          <span>Save format</span>
          <strong>Markdown (.md)</strong>
          {isNasSync && (
            <>
              <span>Remote folder</span>
              <strong>{settings.markdownFolder}</strong>
            </>
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={onSave}>
          <Save size={16} />
          Save Settings
        </button>
      </div>
    </section>
  )
}
