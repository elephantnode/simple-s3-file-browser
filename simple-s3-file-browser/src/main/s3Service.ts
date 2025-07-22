import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadBucketCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AwsCredentials } from './credentials'

export interface S3Object {
  key: string
  size: number
  lastModified: Date
  etag: string
  storageClass?: string
}

export interface S3ListResult {
  objects: S3Object[]
  commonPrefixes: string[]
  isTruncated: boolean
  continuationToken?: string
}

/**
 * S3操作を管理するサービスクラス
 * メインプロセスでのみ実行され、セキュアなAWS操作を提供
 */
export class MainProcessS3Service {
  private s3Client: S3Client
  private credentials: AwsCredentials

  constructor(credentials: AwsCredentials) {
    this.credentials = credentials

    // S3クライアントの初期化
    this.s3Client = new S3Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      },
      // セキュリティ設定
      maxAttempts: 3,
      retryMode: 'adaptive'
    })

    console.log(
      `S3 service initialized for region: ${credentials.region}, bucket: ${credentials.bucket}`
    )
  }

  /**
   * S3接続テスト
   * バケットへのアクセス権限を確認
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing S3 connection...')

      const command = new HeadBucketCommand({
        Bucket: this.credentials.bucket
      })

      await this.s3Client.send(command)
      console.log('S3 connection test successful')
      return true
    } catch (error) {
      console.error('S3 connection test failed:', error)
      return false
    }
  }

  /**
   * S3オブジェクト一覧を取得
   * ページネーション対応
   */
  async listObjects(prefix?: string, continuationToken?: string): Promise<S3ListResult> {
    try {
      console.log(`Listing S3 objects with prefix: ${prefix || 'none'}`)

      const command = new ListObjectsV2Command({
        Bucket: this.credentials.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
        Delimiter: '/' // フォルダ構造を認識
      })

      const response = await this.s3Client.send(command)

      // オブジェクトを整形
      const objects: S3Object[] = (response.Contents || []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || '',
        storageClass: obj.StorageClass
      }))

      // 共通プレフィックス（フォルダ）を取得
      const commonPrefixes = (response.CommonPrefixes || []).map((cp) => cp.Prefix!).filter(Boolean)

      const result: S3ListResult = {
        objects,
        commonPrefixes,
        isTruncated: response.IsTruncated || false,
        continuationToken: response.NextContinuationToken
      }

      console.log(`Found ${objects.length} objects and ${commonPrefixes.length} folders`)
      return result
    } catch (error) {
      console.error('Failed to list S3 objects:', error)
      throw new Error(
        `Failed to list objects: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * ファイルをS3にアップロード
   */
  async uploadFile(fileBuffer: Buffer, key: string, contentType?: string): Promise<string> {
    try {
      console.log(`Uploading file to S3: ${key}`)

      const command = new PutObjectCommand({
        Bucket: this.credentials.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType || 'application/octet-stream'
      })

      const response = await this.s3Client.send(command)
      console.log(`File uploaded successfully: ${key}, ETag: ${response.ETag}`)

      return response.ETag || ''
    } catch (error) {
      console.error('Failed to upload file:', error)
      throw new Error(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * ダウンロード用の署名付きURLを生成
   */
  async getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      console.log(`Generating download URL for: ${key}`)

      const command = new GetObjectCommand({
        Bucket: this.credentials.bucket,
        Key: key
      })

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn // デフォルト1時間
      })

      console.log(`Download URL generated for: ${key}`)
      return signedUrl
    } catch (error) {
      console.error('Failed to generate download URL:', error)
      throw new Error(
        `Failed to generate download URL: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * S3オブジェクトを削除
   */
  async deleteObject(key: string): Promise<void> {
    try {
      console.log(`Deleting S3 object: ${key}`)

      const command = new DeleteObjectCommand({
        Bucket: this.credentials.bucket,
        Key: key
      })

      await this.s3Client.send(command)
      console.log(`Object deleted successfully: ${key}`)
    } catch (error) {
      console.error('Failed to delete object:', error)
      throw new Error(
        `Failed to delete object: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * S3オブジェクトをコピー
   */
  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      console.log(`Copying S3 object from ${sourceKey} to ${destinationKey}`)

      const command = new CopyObjectCommand({
        Bucket: this.credentials.bucket,
        CopySource: `${this.credentials.bucket}/${sourceKey}`,
        Key: destinationKey
      })

      await this.s3Client.send(command)
      console.log(`Object copied successfully: ${sourceKey} -> ${destinationKey}`)
    } catch (error) {
      console.error('Failed to copy object:', error)
      throw new Error(
        `Failed to copy object: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * S3にフォルダ（空のオブジェクト）を作成
   */
  async createFolder(folderPath: string): Promise<void> {
    try {
      // フォルダパスの末尾にスラッシュを追加
      const folderKey = folderPath.endsWith('/') ? folderPath : `${folderPath}/`

      console.log(`Creating S3 folder: ${folderKey}`)

      const command = new PutObjectCommand({
        Bucket: this.credentials.bucket,
        Key: folderKey,
        Body: '',
        ContentType: 'application/x-directory'
      })

      await this.s3Client.send(command)
      console.log(`Folder created successfully: ${folderKey}`)
    } catch (error) {
      console.error('Failed to create folder:', error)
      throw new Error(
        `Failed to create folder: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * リソースの清掃
   */
  destroy(): void {
    console.log('S3 service destroyed')
    // S3Clientは明示的な破棄処理が不要
  }
}
