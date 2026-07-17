const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_SCHEME = 'app'
const APP_HOST = 'lfxdiary'
const DIST_DIR = path.join(__dirname, '..', 'dist')
const APP_ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png')
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const isDev = !app.isPackaged

const NAS_PROXY_TARGETS = {
  '/nas-public-api': 'https://www.lafaxi647.cn:5001',
  '/nas-lan-api': 'https://192.168.0.2:5001',
  '/aliyun-air-api': 'https://ncairhis.market.alicloudapi.com',
  '/cnemc-air-api': 'https://air.cnemc.cn:18007',
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'Diary Book',
    icon: APP_ICON_PATH,
    backgroundColor: '#f7f3ee',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev)
    mainWindow.loadURL(DEV_SERVER_URL)
  else
    mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`)
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const requestUrl = new URL(request.url)
    const pathname = decodeURIComponent(requestUrl.pathname)
    const proxyPrefix = Object.keys(NAS_PROXY_TARGETS).find((prefix) => pathname.startsWith(prefix))

    if (proxyPrefix)
      return proxyNasRequest(request, pathname, requestUrl.search, proxyPrefix)

    return serveStaticFile(pathname)
  })
}

async function proxyNasRequest(request, pathname, search, proxyPrefix) {
  const targetBaseUrl = NAS_PROXY_TARGETS[proxyPrefix]
  const targetPath = pathname.slice(proxyPrefix.length)
  const targetUrl = `${targetBaseUrl}${targetPath}${search}`
  const headers = new Headers(request.headers)
  const hasRequestBody = !['GET', 'HEAD'].includes(request.method)

  headers.delete('host')
  headers.delete('origin')
  headers.delete('referer')

  return net.fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasRequestBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    bypassCustomProtocolHandlers: true,
  })
}

function serveStaticFile(pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const requestedPath = path.resolve(DIST_DIR, relativePath)
  const distRoot = path.resolve(DIST_DIR)
  const relativeToDist = path.relative(distRoot, requestedPath)

  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist))
    return new Response('Not found', { status: 404 })

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile())
    return net.fetch(pathToFileURL(requestedPath).toString())

  return net.fetch(pathToFileURL(path.join(DIST_DIR, 'index.html')).toString())
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  const configPath = path.join(userDataPath, 'diary-config.json')

  function getDataFolder() {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.dataFolder && fs.existsSync(config.dataFolder))
          return config.dataFolder
      }
    } catch { /* use default */ }
    return userDataPath
  }

  function setDataFolder(folderPath) {
    fs.writeFileSync(configPath, JSON.stringify({ dataFolder: folderPath }), 'utf-8')
  }

  function readDataFile(filename) {
    const filePath = path.join(getDataFolder(), filename)
    try {
      if (fs.existsSync(filePath))
        return fs.readFileSync(filePath, 'utf-8')
    } catch (e) {
      console.error(`Error reading ${filename}:`, e)
    }
    return null
  }

  function writeDataFile(filename, data) {
    const folder = getDataFolder()
    if (!fs.existsSync(folder))
      fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, filename), data, 'utf-8')
  }

  ipcMain.handle('diary:readFile', (_event, filename) => readDataFile(filename))
  ipcMain.handle('diary:writeFile', (_event, filename, data) => { writeDataFile(filename, data); return true })
  ipcMain.handle('diary:getDataFolder', () => getDataFolder())
  ipcMain.handle('diary:pickDataFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (!result.canceled && result.filePaths[0]) {
      setDataFolder(result.filePaths[0])
      return result.filePaths[0]
    }
    return getDataFolder()
  })

  registerAppProtocol()

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === '192.168.0.2') {
      callback(0)
      return
    }

    callback(-3)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
