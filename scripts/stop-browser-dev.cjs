const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const runDir = path.join(projectRoot, '.run')
const pidFile = path.join(runDir, 'browser-dev.pid')
const logFile = path.join(runDir, 'browser-dev.log')

const pid = readExistingPid()

if (!pid) {
  writeLog('No browser dev server PID was found.\n')
  process.exit(0)
}

try {
  if (process.platform === 'win32')
    childProcess.execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else
    process.kill(-pid, 'SIGTERM')

  writeLog(`Stopped browser dev server. PID: ${pid}\n`)
} catch (error) {
  writeLog(`Failed to stop browser dev server ${pid}: ${error.message || String(error)}\n`)
} finally {
  fs.rmSync(pidFile, { force: true })
}

function readExistingPid() {
  if (!fs.existsSync(pidFile))
    return undefined

  const pidValue = Number(fs.readFileSync(pidFile, 'utf8').trim())
  return Number.isInteger(pidValue) && pidValue > 0 ? pidValue : undefined
}

function writeLog(message) {
  fs.mkdirSync(runDir, { recursive: true })
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}`)
}
