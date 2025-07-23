import { useState, useEffect } from 'react'
import CredentialsForm from './components/CredentialsForm'
import FileBrowser from './components/FileBrowser'
import { AwsCredentials } from './types/aws'

function App(): React.JSX.Element {
  const [hasCredentials, setHasCredentials] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showCredentialsForm, setShowCredentialsForm] = useState(false)
  const [currentCredentials, setCurrentCredentials] = useState<AwsCredentials | null>(null)

  // 起動時に保存済み認証情報をチェック
  useEffect(() => {
    checkExistingCredentials()
  }, [])

  const checkExistingCredentials = async (): Promise<void> => {
    setIsLoading(true)
    try {
      const hasStoredCredentials = await window.api.credentials.has()

      if (hasStoredCredentials) {
        const credentials = await window.api.credentials.load()
        if (credentials) {
          setCurrentCredentials(credentials)
          setHasCredentials(true)

          // S3サービスを初期化
          await window.api.s3.init()
        }
      }
    } catch (error) {
      console.error('Failed to check existing credentials:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCredentialsSaved = async (credentials: AwsCredentials): Promise<void> => {
    setCurrentCredentials(credentials)
    setHasCredentials(true)
    setShowCredentialsForm(false)

    // S3サービスを初期化
    try {
      await window.api.s3.init()
    } catch (error) {
      console.error('Failed to initialize S3 service:', error)
    }
  }

  const handleCredentialsRequired = (): void => {
    setShowCredentialsForm(true)
  }

  const handleDeleteCredentials = async (): Promise<void> => {
    if (!confirm('保存された認証情報を削除しますか？')) return

    try {
      await window.api.credentials.delete()
      setCurrentCredentials(null)
      setHasCredentials(false)
      setShowCredentialsForm(true)
    } catch (error) {
      console.error('Failed to delete credentials:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-2xl mb-4">⏳</div>
          <p className="text-gray-600">アプリケーションを初期化中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🗂️</div>
              <h1 className="text-xl font-semibold text-gray-900">Simple S3 File Browser</h1>
              {currentCredentials && (
                <div className="text-sm text-gray-500 ml-4">
                  {currentCredentials.region} / {currentCredentials.bucket}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {hasCredentials && (
                <>
                  <button
                    onClick={() => setShowCredentialsForm(true)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    ⚙️ 設定
                  </button>
                  <button
                    onClick={handleDeleteCredentials}
                    className="text-red-600 hover:text-red-800"
                  >
                    🗑️ 認証情報削除
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!hasCredentials || showCredentialsForm ? (
          <div className="flex items-center justify-center min-h-96">
            <CredentialsForm
              onCredentialsSaved={handleCredentialsSaved}
              onCancel={hasCredentials ? () => setShowCredentialsForm(false) : undefined}
              initialCredentials={currentCredentials || undefined}
            />
          </div>
        ) : (
          <FileBrowser onCredentialsRequired={handleCredentialsRequired} />
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="text-center text-sm text-gray-500">
            Electron + Vite + React + TailwindCSS v4 + AWS S3
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
