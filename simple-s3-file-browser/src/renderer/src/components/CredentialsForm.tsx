import { useState } from 'react'
import { AwsCredentials, AWS_REGIONS } from '../types/aws'

interface CredentialsFormProps {
  onCredentialsSaved: (credentials: AwsCredentials) => void
  onCancel?: () => void
  initialCredentials?: Partial<AwsCredentials>
}

interface ValidationErrors {
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  bucket?: string
}

export default function CredentialsForm({
  onCredentialsSaved,
  onCancel,
  initialCredentials
}: CredentialsFormProps): React.JSX.Element {
  const [credentials, setCredentials] = useState<AwsCredentials>({
    accessKeyId: initialCredentials?.accessKeyId || '',
    secretAccessKey: initialCredentials?.secretAccessKey || '',
    region: initialCredentials?.region || 'us-east-1',
    bucket: initialCredentials?.bucket || ''
  })

  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {}

    if (!credentials.accessKeyId.trim()) {
      newErrors.accessKeyId = 'アクセスキーIDが必要です'
    } else if (!/^[A-Z0-9]{20}$/.test(credentials.accessKeyId)) {
      newErrors.accessKeyId = 'アクセスキーIDの形式が正しくありません'
    }

    if (!credentials.secretAccessKey.trim()) {
      newErrors.secretAccessKey = 'シークレットアクセスキーが必要です'
    } else if (credentials.secretAccessKey.length < 40) {
      newErrors.secretAccessKey = 'シークレットアクセスキーの長さが不足しています'
    }

    if (!credentials.region) {
      newErrors.region = 'リージョンを選択してください'
    }

    if (!credentials.bucket.trim()) {
      newErrors.bucket = 'バケット名が必要です'
    } else if (!/^[a-z0-9.-]{3,63}$/.test(credentials.bucket)) {
      newErrors.bucket = 'バケット名の形式が正しくありません'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTestConnection = async (): Promise<void> => {
    if (!validateForm()) return

    setTestStatus('testing')
    try {
      // 一時的に認証情報を保存してテスト
      await window.api.credentials.save(credentials)
      await window.api.s3.init()
      const result = await window.api.s3.testConnection()

      if (result) {
        setTestStatus('success')
      } else {
        setTestStatus('error')
      }
    } catch (error) {
      console.error('Connection test failed:', error)
      setTestStatus('error')
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    try {
      await window.api.credentials.save(credentials)
      await window.api.s3.init()
      onCredentialsSaved(credentials)
    } catch (error) {
      console.error('Failed to save credentials:', error)
      setErrors({ accessKeyId: '認証情報の保存に失敗しました' })
    } finally {
      setIsLoading(false)
    }
  }

  const updateCredential = (field: keyof AwsCredentials, value: string): void => {
    setCredentials((prev) => ({ ...prev, [field]: value }))
    setTestStatus('idle')
    // フィールド更新時にそのフィールドのエラーをクリア
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">AWS認証情報</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* アクセスキーID */}
        <div>
          <label htmlFor="accessKeyId" className="block text-sm font-medium text-gray-700 mb-1">
            アクセスキーID
          </label>
          <input
            type="text"
            id="accessKeyId"
            value={credentials.accessKeyId}
            onChange={(e) => updateCredential('accessKeyId', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
              errors.accessKeyId ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            autoComplete="off"
          />
          {errors.accessKeyId && <p className="text-red-500 text-sm mt-1">{errors.accessKeyId}</p>}
        </div>

        {/* シークレットアクセスキー */}
        <div>
          <label htmlFor="secretAccessKey" className="block text-sm font-medium text-gray-700 mb-1">
            シークレットアクセスキー
          </label>
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              id="secretAccessKey"
              value={credentials.secretAccessKey}
              onChange={(e) => updateCredential('secretAccessKey', e.target.value)}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
                errors.secretAccessKey ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              {showSecretKey ? '🔒' : '🔓'}
            </button>
          </div>
          {errors.secretAccessKey && (
            <p className="text-red-500 text-sm mt-1">{errors.secretAccessKey}</p>
          )}
        </div>

        {/* リージョン */}
        <div>
          <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">
            リージョン
          </label>
          <select
            id="region"
            value={credentials.region}
            onChange={(e) => updateCredential('region', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
              errors.region ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            {AWS_REGIONS.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
          {errors.region && <p className="text-red-500 text-sm mt-1">{errors.region}</p>}
        </div>

        {/* バケット名 */}
        <div>
          <label htmlFor="bucket" className="block text-sm font-medium text-gray-700 mb-1">
            S3バケット名
          </label>
          <input
            type="text"
            id="bucket"
            value={credentials.bucket}
            onChange={(e) => updateCredential('bucket', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
              errors.bucket ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="my-s3-bucket"
            autoComplete="off"
          />
          {errors.bucket && <p className="text-red-500 text-sm mt-1">{errors.bucket}</p>}
        </div>

        {/* 接続テスト */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isLoading || testStatus === 'testing'}
            className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testStatus === 'testing' ? '接続中...' : '接続テスト'}
          </button>

          {testStatus === 'success' && (
            <span className="text-green-600 text-sm flex items-center">✅ 接続成功</span>
          )}

          {testStatus === 'error' && (
            <span className="text-red-600 text-sm flex items-center">❌ 接続失敗</span>
          )}
        </div>

        {/* ボタン */}
        <div className="flex gap-3 pt-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              キャンセル
            </button>
          )}

          <button
            type="submit"
            disabled={isLoading || testStatus === 'testing'}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}
