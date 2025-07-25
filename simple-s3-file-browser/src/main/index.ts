import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { CredentialsManager } from './credentials'
import { MainProcessS3Service } from './s3Service'

function createWindow(): void {
  // Create the browser window with enhanced security settings.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // セキュリティ設定: プロセス分離とコンテキスト分離
      sandbox: false, // プリロードスクリプト使用のためfalse
      contextIsolation: true, // レンダラープロセスとメインプロセスの分離
      nodeIntegration: false, // レンダラープロセスでのNode.js API無効化
      webSecurity: true, // Web セキュリティ有効
      allowRunningInsecureContent: false, // 安全でないコンテンツの実行を禁止
      experimentalFeatures: false // 実験的機能を無効化
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // セキュリティ: ナビゲーション制限
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 現在のURLと異なる場合はナビゲーションを阻止
    if (url !== mainWindow.webContents.getURL()) {
      console.log('Navigation blocked:', url)
      event.preventDefault()
    }
  })

  // セキュリティ: 外部リソース読み込み制限
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url

    // HTTP/HTTPSリクエストをチェック
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // localhostのみ許可（開発時のHMR用）
      if (!url.startsWith('http://localhost:') && !url.startsWith('https://localhost:')) {
        console.log('External resource blocked:', url)
        callback({ cancel: true })
        return
      }
    }
    callback({ cancel: false })
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.simple-s3-file-browser')

  // セキュリティ: カスタムプロトコルの設定
  app.setAsDefaultProtocolClient('simple-s3-file-browser')

  // セキュリティ: webview の作成を禁止
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-attach-webview', (event) => {
      console.log('Webview attachment blocked')
      event.preventDefault()
    })

    // セキュリティ: レンダラープロセスでの新しいウィンドウ作成を制限
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl)

      // ローカルファイル以外へのナビゲーションを制限
      if (parsedUrl.origin !== 'file://' && !parsedUrl.origin.startsWith('http://localhost:')) {
        console.log('Navigation blocked at app level:', navigationUrl)
        event.preventDefault()
      }
    })
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 認証情報管理のIPCハンドラ
  const credentialsManager = CredentialsManager.getInstance()

  ipcMain.handle('credentials:save', async (_, credentials) => {
    return await credentialsManager.saveCredentials(credentials)
  })

  ipcMain.handle('credentials:load', async () => {
    return await credentialsManager.loadCredentials()
  })

  ipcMain.handle('credentials:delete', async () => {
    return await credentialsManager.deleteCredentials()
  })

  ipcMain.handle('credentials:has', async () => {
    return await credentialsManager.hasCredentials()
  })

  // S3操作のIPCハンドラ
  let s3Service: MainProcessS3Service | null = null

  ipcMain.handle('s3:init', async () => {
    try {
      const credentials = await credentialsManager.loadCredentials()
      if (credentials) {
        // 既存のS3サービスがある場合は破棄
        if (s3Service) {
          s3Service.destroy()
        }
        s3Service = new MainProcessS3Service(credentials)
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to initialize S3 service:', error)
      return false
    }
  })

  ipcMain.handle('s3:testConnection', async () => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.testConnection()
  })

  ipcMain.handle('s3:listObjects', async (_, prefix, continuationToken) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.listObjects(prefix, continuationToken)
  })

  ipcMain.handle('s3:uploadFile', async (_, fileBuffer, key, contentType) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.uploadFile(Buffer.from(fileBuffer), key, contentType)
  })

  ipcMain.handle('s3:getDownloadUrl', async (_, key, expiresIn) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.getDownloadUrl(key, expiresIn)
  })

  ipcMain.handle('s3:deleteObject', async (_, key) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.deleteObject(key)
  })

  ipcMain.handle('s3:copyObject', async (_, sourceKey, destinationKey) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.copyObject(sourceKey, destinationKey)
  })

  ipcMain.handle('s3:createFolder', async (_, folderPath) => {
    if (!s3Service) {
      throw new Error('S3 service not initialized')
    }
    return await s3Service.createFolder(folderPath)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
