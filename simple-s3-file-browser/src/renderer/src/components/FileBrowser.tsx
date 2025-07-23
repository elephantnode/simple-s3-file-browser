import { useState, useEffect, useCallback } from 'react'
import { S3Object, S3ListResult } from '../types/aws'

interface FileBrowserProps {
  onCredentialsRequired: () => void
}

export default function FileBrowser({
  onCredentialsRequired
}: FileBrowserProps): React.JSX.Element {
  const [objects, setObjects] = useState<S3Object[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({})

  const loadObjects = useCallback(
    async (path: string = '') => {
      setIsLoading(true)
      setError('')

      try {
        const result: S3ListResult = await window.api.s3.listObjects(path)
        console.log('S3 List Result:', result)
        console.log('Folders (commonPrefixes):', result.commonPrefixes)
        setObjects(result.objects)
        setFolders(result.commonPrefixes)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました'
        if (errorMessage.includes('not initialized')) {
          onCredentialsRequired()
          return
        }
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    },
    [onCredentialsRequired]
  )

  useEffect(() => {
    loadObjects(currentPath)
  }, [currentPath, loadObjects])

  const handleSort = (field: 'name' | 'size' | 'date'): void => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const sortedObjects = [...objects].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.key.localeCompare(b.key)
        break
      case 'size':
        comparison = a.size - b.size
        break
      case 'date':
        comparison = a.lastModified.getTime() - b.lastModified.getTime()
        break
    }

    return sortOrder === 'asc' ? comparison : -comparison
  })

  const navigateToFolder = (folderPath: string): void => {
    setCurrentPath(folderPath)
    setSelectedItems(new Set())
  }

  const navigateUp = (): void => {
    const pathParts = currentPath.split('/').filter(Boolean)
    if (pathParts.length > 0) {
      pathParts.pop()
      setCurrentPath(pathParts.join('/'))
    }
  }

  const handleFileUpload = async (files: FileList): Promise<void> => {
    const uploads = Array.from(files).map(async (file) => {
      const key = currentPath ? `${currentPath}/${file.name}` : file.name
      const fileBuffer = await file.arrayBuffer()

      try {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }))

        await window.api.s3.uploadFile(fileBuffer, key, file.type)

        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }))

        // アップロード完了後に進捗を削除
        setTimeout(() => {
          setUploadProgress((prev) => {
            const newProgress = { ...prev }
            delete newProgress[file.name]
            return newProgress
          })
        }, 1000)
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error)
        setUploadProgress((prev) => {
          const newProgress = { ...prev }
          delete newProgress[file.name]
          return newProgress
        })
        throw error
      }
    })

    try {
      await Promise.all(uploads)
      await loadObjects(currentPath)
      setShowUploadDialog(false)
    } catch {
      setError('ファイルのアップロードに失敗しました')
    }
  }

  const handleDownload = async (object: S3Object): Promise<void> => {
    try {
      const downloadUrl = await window.api.s3.getDownloadUrl(object.key)

      // ダウンロードリンクを作成してクリック
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = object.key.split('/').pop() || object.key
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      setError('ダウンロードに失敗しました')
    }
  }

  const handleDelete = async (key: string): Promise<void> => {
    if (!confirm(`${key} を削除しますか？`)) return

    try {
      await window.api.s3.deleteObject(key)
      await loadObjects(currentPath)
    } catch {
      setError('削除に失敗しました')
    }
  }

  const toggleSelection = (key: string): void => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFolderName = (folderPath: string): string => {
    // S3のCommonPrefixesは末尾に/が付くので削除してフォルダ名のみ取得
    console.log('Processing folder path:', folderPath)
    const cleanPath = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath
    const parts = cleanPath.split('/')
    const folderName = parts[parts.length - 1] || 'Unknown'
    console.log('Extracted folder name:', folderName)
    return folderName
  }

  const breadcrumbParts = currentPath ? currentPath.split('/').filter(Boolean) : []

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 text-gray-900">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">S3ファイルブラウザ</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUploadDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            アップロード
          </button>
          <button
            onClick={() => loadObjects(currentPath)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            🔄 更新
          </button>
        </div>
      </div>

      {/* パンくずナビ */}
      <nav className="flex items-center gap-2 mb-4 text-sm">
        <button
          onClick={() => navigateToFolder('')}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          🏠 ルート
        </button>
        {breadcrumbParts.map((part, index) => (
          <span key={index} className="flex items-center gap-2">
            <span className="text-gray-500">/</span>
            <button
              onClick={() => navigateToFolder(breadcrumbParts.slice(0, index + 1).join('/'))}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {part}
            </button>
          </span>
        ))}
        {currentPath && (
          <button
            onClick={navigateUp}
            className="ml-auto px-2 py-1 text-gray-600 hover:bg-gray-100 rounded font-medium"
          >
            ← 戻る
          </button>
        )}
      </nav>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {/* アップロード進捗 */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
          <h3 className="font-medium mb-2">アップロード中...</h3>
          {Object.entries(uploadProgress).map(([filename, progress]) => (
            <div key={filename} className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span>{filename}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* テーブルヘッダー */}
      <div className="overflow-x-auto">
        <table className="w-full text-gray-900">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-8">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedItems(new Set([...folders, ...objects.map((obj) => obj.key)]))
                    } else {
                      setSelectedItems(new Set())
                    }
                  }}
                  checked={
                    selectedItems.size > 0 && selectedItems.size === folders.length + objects.length
                  }
                />
              </th>
              <th
                className="text-left py-3 px-4 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('name')}
              >
                名前 {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="text-left py-3 px-4 cursor-pointer hover:bg-gray-50 w-24"
                onClick={() => handleSort('size')}
              >
                サイズ {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="text-left py-3 px-4 cursor-pointer hover:bg-gray-50 w-40"
                onClick={() => handleSort('date')}
              >
                更新日時 {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  読み込み中...
                </td>
              </tr>
            ) : (
              <>
                {/* フォルダ */}
                {folders.map((folder) => (
                  <tr key={folder} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(folder)}
                        onChange={() => toggleSelection(folder)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigateToFolder(folder)}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        📁 {getFolderName(folder)}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-gray-500">-</td>
                    <td className="py-3 px-4 text-gray-500">-</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDelete(folder)}
                        className="text-red-600 hover:text-red-800"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}

                {/* ファイル */}
                {sortedObjects.map((object) => (
                  <tr key={object.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(object.key)}
                        onChange={() => toggleSelection(object.key)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-2">
                        📄 {object.key.split('/').pop()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatFileSize(object.size)}</td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(object.lastModified)}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload(object)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          ダウンロード
                        </button>
                        <button
                          onClick={() => handleDelete(object.key)}
                          className="text-red-600 hover:text-red-800"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {folders.length === 0 && objects.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      フォルダが空です
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* アップロードダイアログ */}
      {showUploadDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 text-gray-900">
            <h3 className="text-lg font-bold mb-4">ファイルをアップロード</h3>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const files = e.dataTransfer.files
                if (files.length > 0) {
                  handleFileUpload(files)
                }
              }}
            >
              <input
                type="file"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileUpload(e.target.files)
                  }
                }}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-gray-600">
                  <div className="text-4xl mb-2">📁</div>
                  <p>ファイルをここにドラッグ&ドロップ</p>
                  <p className="text-sm text-gray-500">または クリックして選択</p>
                </div>
              </label>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowUploadDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
