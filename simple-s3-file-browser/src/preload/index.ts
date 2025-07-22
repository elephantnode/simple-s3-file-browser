import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

// Custom APIs for renderer
const api = {
  // 認証情報管理 API
  credentials: {
    save: (credentials: AwsCredentials) => ipcRenderer.invoke('credentials:save', credentials),
    load: () => ipcRenderer.invoke('credentials:load'),
    delete: () => ipcRenderer.invoke('credentials:delete'),
    has: () => ipcRenderer.invoke('credentials:has')
  },

  // S3操作 API
  s3: {
    init: () => ipcRenderer.invoke('s3:init'),
    testConnection: () => ipcRenderer.invoke('s3:testConnection'),
    listObjects: (prefix?: string, continuationToken?: string) =>
      ipcRenderer.invoke('s3:listObjects', prefix, continuationToken),
    uploadFile: (fileBuffer: ArrayBuffer, key: string, contentType?: string) =>
      ipcRenderer.invoke('s3:uploadFile', fileBuffer, key, contentType),
    getDownloadUrl: (key: string, expiresIn?: number) =>
      ipcRenderer.invoke('s3:getDownloadUrl', key, expiresIn),
    deleteObject: (key: string) => ipcRenderer.invoke('s3:deleteObject', key),
    copyObject: (sourceKey: string, destinationKey: string) =>
      ipcRenderer.invoke('s3:copyObject', sourceKey, destinationKey),
    createFolder: (folderPath: string) => ipcRenderer.invoke('s3:createFolder', folderPath)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
