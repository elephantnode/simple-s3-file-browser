// CommonJSスタイルでのインポート（electron-store v8+の対応）
import { safeStorage } from 'electron'

// Store型の定義
type StoreType = {
  set: (key: string, value: unknown) => void
  get: (key: string) => unknown
  delete: (key: string) => void
  path: string
}

type StoreConstructor = new (options: {
  name: string
  encryptionKey?: string
  clearInvalidConfig?: boolean
}) => StoreType

// 動的インポートでelectron-storeを読み込み
let Store: StoreConstructor

// 非同期でStoreを初期化する関数
async function initStore(): Promise<StoreConstructor> {
  if (!Store) {
    // CommonJS形式でインポート
    const ElectronStore = await import('electron-store')
    Store = ElectronStore.default as unknown as StoreConstructor
  }
  return Store
}

// electron-storeの型安全なラッパー
interface TypedElectronStore<T> {
  set<K extends keyof T>(key: K, value: T[K]): void
  get<K extends keyof T>(key: K): T[K] | undefined
  delete<K extends keyof T>(key: K): void
  path: string
}

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

// 暗号化された認証情報の保存形式を定義
interface EncryptedCredentials {
  encrypted: string // Base64エンコードされた暗号化データ
  region: string
  bucket: string
}

// ストレージに保存されるデータの型定義
type StoredCredentialsData = AwsCredentials | EncryptedCredentials

// 型安全なストレージ設定
interface CredentialsStore {
  credentials?: StoredCredentialsData
}

// 遅延初期化されるストレージ
let secureStore: TypedElectronStore<CredentialsStore> | null = null

// Storeの初期化
async function getSecureStore(): Promise<TypedElectronStore<CredentialsStore>> {
  if (!secureStore) {
    const StoreClass = await initStore()
    const rawStore = new StoreClass({
      name: 'secure-credentials',
      encryptionKey: 'simple-s3-file-browser-secure-key-2024',
      clearInvalidConfig: true
    })

    // 型安全なラッパーを作成
    secureStore = {
      set: <K extends keyof CredentialsStore>(key: K, value: CredentialsStore[K]) =>
        rawStore.set(String(key), value),
      get: <K extends keyof CredentialsStore>(key: K): CredentialsStore[K] | undefined =>
        rawStore.get(String(key)) as CredentialsStore[K] | undefined,
      delete: <K extends keyof CredentialsStore>(key: K) => rawStore.delete(String(key)),
      path: rawStore.path
    }
  }
  return secureStore
}

// 型ガード関数: 暗号化されたデータかどうかを判定
function isEncryptedCredentials(data: StoredCredentialsData): data is EncryptedCredentials {
  return typeof data === 'object' && 'encrypted' in data && typeof data.encrypted === 'string'
}

// 型ガード関数: 平文の認証情報かどうかを判定
function isPlainCredentials(data: StoredCredentialsData): data is AwsCredentials {
  return (
    typeof data === 'object' &&
    'accessKeyId' in data &&
    'secretAccessKey' in data &&
    typeof data.accessKeyId === 'string' &&
    typeof data.secretAccessKey === 'string'
  )
}

/**
 * AWS認証情報を安全に管理するクラス
 * Singletonパターンで実装し、暗号化ストレージを使用
 */
export class CredentialsManager {
  private static instance: CredentialsManager

  private constructor() {
    // Singletonパターンのためのプライベートコンストラクタ
  }

  /**
   * インスタンスを取得（Singletonパターン）
   */
  static getInstance(): CredentialsManager {
    if (!CredentialsManager.instance) {
      CredentialsManager.instance = new CredentialsManager()
    }
    return CredentialsManager.instance
  }

  /**
   * 認証情報を安全に保存
   * 可能な場合はElectronの safeStorage を使用し、
   * そうでなければ electron-store の暗号化機能を使用
   */
  async saveCredentials(credentials: AwsCredentials): Promise<void> {
    try {
      console.log('Saving credentials to encrypted storage...')

      const store = await getSecureStore()
      let credentialsToStore: StoredCredentialsData

      // Electronの安全なストレージ機能が利用可能かチェック
      if (safeStorage.isEncryptionAvailable()) {
        console.log('Using Electron safeStorage for encryption')

        // 機密データ（アクセスキーとシークレットキー）のみ暗号化
        const sensitiveData = JSON.stringify({
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey
        })

        const encryptedBuffer = safeStorage.encryptString(sensitiveData)

        // 暗号化されたデータと平文データを分離
        const encryptedCredentials: EncryptedCredentials = {
          encrypted: encryptedBuffer.toString('base64'),
          region: credentials.region,
          bucket: credentials.bucket
        }
        credentialsToStore = encryptedCredentials
      } else {
        console.log('Using electron-store encryption fallback')
        // フォールバック: electron-store の暗号化機能を使用
        credentialsToStore = credentials
      }

      store.set('credentials', credentialsToStore)
      console.log('Credentials saved successfully to encrypted storage')
    } catch (error) {
      console.error('Failed to save credentials:', error)
      throw new Error(
        `Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 認証情報を安全に読み込み
   * 保存時と同じ暗号化方式で復号化
   */
  async loadCredentials(): Promise<AwsCredentials | null> {
    try {
      console.log('Loading credentials from encrypted storage...')

      const store = await getSecureStore()
      const storedCredentials = store.get('credentials')

      if (!storedCredentials) {
        console.log('No credentials found in storage')
        return null
      }

      // 型ガードを使用して安全にデータをチェック
      if (isEncryptedCredentials(storedCredentials)) {
        console.log('Decrypting credentials using Electron safeStorage')

        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('Encrypted credentials found but safeStorage is not available')
        }

        const encryptedBuffer = Buffer.from(storedCredentials.encrypted, 'base64')
        const decryptedString = safeStorage.decryptString(encryptedBuffer)

        // JSONパースの結果も型安全にチェック
        const sensitiveData = JSON.parse(decryptedString)

        if (!sensitiveData.accessKeyId || !sensitiveData.secretAccessKey) {
          throw new Error('Invalid decrypted credentials format')
        }

        return {
          accessKeyId: sensitiveData.accessKeyId,
          secretAccessKey: sensitiveData.secretAccessKey,
          region: storedCredentials.region,
          bucket: storedCredentials.bucket
        }
      } else if (isPlainCredentials(storedCredentials)) {
        console.log('Using electron-store stored credentials')
        return storedCredentials
      } else {
        throw new Error('Invalid credentials format in storage')
      }
    } catch (error) {
      console.error('Failed to load credentials:', error)
      return null
    }
  }

  /**
   * 認証情報を削除
   */
  async deleteCredentials(): Promise<void> {
    try {
      console.log('Deleting credentials from encrypted storage...')
      const store = await getSecureStore()
      store.delete('credentials')
      console.log('Credentials deleted successfully')
    } catch (error) {
      console.error('Failed to delete credentials:', error)
      throw new Error(
        `Failed to delete credentials: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 認証情報の存在チェック
   */
  async hasCredentials(): Promise<boolean> {
    try {
      const store = await getSecureStore()
      const storedCredentials = store.get('credentials')
      return storedCredentials !== undefined
    } catch (error) {
      console.error('Failed to check credentials:', error)
      return false
    }
  }

  /**
   * デバッグ用: ストレージのパスを取得
   */
  async getStorePath(): Promise<string> {
    const store = await getSecureStore()
    return store.path
  }
}
