import { ElectronAPI } from '@electron-toolkit/preload'

interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

interface S3Object {
  key: string
  size: number
  lastModified: Date
  etag: string
  storageClass?: string
}

interface S3ListResult {
  objects: S3Object[]
  commonPrefixes: string[]
  isTruncated: boolean
  continuationToken?: string
}

interface API {
  credentials: {
    save: (credentials: AwsCredentials) => Promise<void>
    load: () => Promise<AwsCredentials | null>
    delete: () => Promise<void>
    has: () => Promise<boolean>
  }
  s3: {
    init: () => Promise<boolean>
    testConnection: () => Promise<boolean>
    listObjects: (prefix?: string, continuationToken?: string) => Promise<S3ListResult>
    uploadFile: (fileBuffer: ArrayBuffer, key: string, contentType?: string) => Promise<string>
    getDownloadUrl: (key: string, expiresIn?: number) => Promise<string>
    deleteObject: (key: string) => Promise<void>
    copyObject: (sourceKey: string, destinationKey: string) => Promise<void>
    createFolder: (folderPath: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
