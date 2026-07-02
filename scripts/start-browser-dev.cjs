const childProcess = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const runDir = path.join(projectRoot, '.run')
const pidFile = path.join(runDir, 'browser-dev.pid')
const logFile = path.join(runDir, 'browser-dev.log')
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const port = 5173

main().catch((error) => {
  writeLog(`Failed to start browser dev server: ${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})

async function main() {
  fs.mkdirSync(runDir, { recursive: true })

  const existingPid = readExistingPid()
  if (existingPid && isProcessRunning(existingPid)) {
    openBrowser()
    writeLog(`Browser dev server is already running. PID: ${existingPid}\n`)
    return
  }

  removePidFile()

  if (!fs.existsSync(viteBin))
    installDependencies()

  if (await isPortOpen(port)) {
    openBrowser()
    writeLog(`Port ${port} is already in use. Opened existing browser page.\n`)
    return
  }

  const log = fs.openSync(logFile, 'a')
  const child = childProcess.spawn(
    process.execPath,
    [
      viteBin,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
      '--open',
    ],
    {
      cwd: projectRoot,
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true,
    },
  )

  fs.writeFileSync(pidFile, String(child.pid))
  child.unref()
  writeLog(`Started browser dev server. PID: ${child.pid}\n`)
}

function installDependencies() {
  writeLog('node_modules not found. Running npm install...\n')
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  childProcess.execFileSync(npmCommand, ['install'], {
    cwd: projectRoot,
    stdio: ['ignore', appendLogStream(), appendLogStream()],
    windowsHide: true,
  })
}

function openBrowser() {
  const url = `http://127.0.0.1:${port}`

  if (process.platform === 'win32') {
    childProcess.spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
    return
  }

  if (process.platform === 'darwin') {
    childProcess.spawn('open', [url], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    return
  }

  childProcess.spawn('xdg-open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

function readExistingPid() {
  if (!fs.existsSync(pidFile))
    return undefined

  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
  return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function removePidFile() {
  try {
    fs.rmSync(pidFile, { force: true })
  } catch {
    // Best effort cleanup; startup can continue without it.
  }
}

function isPortOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function appendLogStream() {
  fs.mkdirSync(runDir, { recursive: true })
  return fs.openSync(logFile, 'a')
}

function writeLog(message) {
  fs.mkdirSync(runDir, { recursive: true })
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}`)
}
