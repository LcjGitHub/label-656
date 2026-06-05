import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fileApi } from '../services/api.js'
import FileUpload from '../components/FileUpload.jsx'
import FileCard from '../components/FileCard.jsx'
import FilePreviewModal from '../components/FilePreviewModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function FilePage() {
  const [files, setFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [searchKeyword, setSearchKeyword] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('')
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const { user, logout } = useAuth()
  const location = useLocation()

  const fetchFiles = async (search = '', fileType = '') => {
    try {
      setLoading(true)
      setError('')
      const response = await fileApi.getFiles(search, fileType)
      setFiles(response.data)
    } catch (err) {
      setError('加载文件列表失败，请稍后重试')
      console.error('Error fetching files:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles(searchKeyword, fileTypeFilter)
  }, [searchKeyword, fileTypeFilter])

  const handleSearch = (e) => {
    setSearchKeyword(e.target.value)
    setLoading(true)
  }

  const handleFileTypeChange = (type) => {
    setFileTypeFilter(type)
    setLoading(true)
  }

  const handleFilesSelected = (files) => {
    setPendingFiles(files)
  }

  const handleUpload = async () => {
    if (pendingFiles.length === 0) {
      setError('请先选择要上传的文件')
      return
    }

    try {
      setUploading(true)
      setError('')
      setSuccess('')
      setUploadProgress(0)

      const response = await fileApi.uploadFiles(pendingFiles, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        setUploadProgress(percentCompleted)
      })

      setSuccess(response.data.message)
      setPendingFiles([])
      setIsUploadModalOpen(false)
      fetchFiles(searchKeyword, fileTypeFilter)
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('上传文件失败，请稍后重试')
      }
      console.error('Error uploading files:', err)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleSelectFile = (fileId) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId)
    } else {
      newSelected.add(fileId)
    }
    setSelectedFiles(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(files.map(f => f.id)))
    }
  }

  const handlePreview = (file) => {
    setPreviewFile(file)
    setIsPreviewOpen(true)
  }

  const handleClosePreview = () => {
    setIsPreviewOpen(false)
    setPreviewFile(null)
  }

  const handleDeleteFile = async (fileId) => {
    try {
      setError('')
      await fileApi.deleteFile(fileId)
      setSelectedFiles(prev => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
      fetchFiles(searchKeyword, fileTypeFilter)
      setSuccess('文件删除成功')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('删除文件失败，请稍后重试')
      }
      console.error('Error deleting file:', err)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedFiles.size === 0) {
      setError('请先选择要删除的文件')
      return
    }

    if (!window.confirm(`确定要删除选中的 ${selectedFiles.size} 个文件吗？此操作不可恢复。`)) {
      return
    }

    try {
      setError('')
      const fileIds = Array.from(selectedFiles)
      const response = await fileApi.batchDeleteFiles(fileIds)
      setSelectedFiles(new Set())
      fetchFiles(searchKeyword, fileTypeFilter)
      setSuccess(response.data.message)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('批量删除文件失败，请稍后重试')
      }
      console.error('Error batch deleting files:', err)
    }
  }

  const handleLogout = async () => {
    if (window.confirm('确定要退出登录吗？')) {
      await logout()
    }
  }

  const fileTypeOptions = [
    { value: '', label: '全部' },
    { value: 'image', label: '🖼️ 图片' },
    { value: 'document', label: '📄 文档' },
    { value: 'archive', label: '📦 压缩包' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>📁 文件管理</h1>
            <p>上传、管理和下载你的文件</p>
          </div>
          <nav className="main-nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              📝 笔记
            </Link>
            <Link
              to="/files"
              className={`nav-link ${location.pathname === '/files' ? 'active' : ''}`}
            >
              📁 文件
            </Link>
          </nav>
          <div className="user-info">
            <span className="user-greeting">
              👤 {user?.full_name || user?.username}
            </span>
            <button className="btn btn-logout" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索文件名..."
          value={searchKeyword}
          onChange={handleSearch}
        />

        <div className="filter-buttons">
          {fileTypeOptions.map(option => (
            <button
              key={option.value}
              className={`filter-btn ${fileTypeFilter === option.value ? 'active' : ''}`}
              onClick={() => handleFileTypeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={() => setIsUploadModalOpen(true)}>
          + 上传文件
        </button>
      </div>

      {selectedFiles.size > 0 && (
        <div className="batch-actions">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedFiles.size === files.length && files.length > 0}
              onChange={handleSelectAll}
            />
            全选
          </label>
          <span className="selected-count">
            已选择 {selectedFiles.size} 个文件
          </span>
          <button className="btn btn-danger" onClick={handleBatchDelete}>
            🗑️ 批量删除
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <h3>
            {searchKeyword || fileTypeFilter ? '没有找到匹配的文件' : '还没有上传任何文件'}
          </h3>
          <p>
            {searchKeyword || fileTypeFilter
              ? '试试其他关键词或筛选条件'
              : '点击上方按钮上传你的第一个文件'}
          </p>
        </div>
      ) : (
        <div className="files-grid">
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              isSelected={selectedFiles.has(file.id)}
              onSelect={handleSelectFile}
              onPreview={handlePreview}
              onDelete={handleDeleteFile}
            />
          ))}
        </div>
      )}

      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => !uploading && setIsUploadModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>上传文件</h3>
              <button
                className="btn-close"
                onClick={() => !uploading && setIsUploadModalOpen(false)}
                disabled={uploading}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <FileUpload onFilesSelected={handleFilesSelected} maxFiles={10} />

              {uploading && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p>上传中... {uploadProgress}%</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setIsUploadModalOpen(false)}
                disabled={uploading}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || pendingFiles.length === 0}
              >
                {uploading ? '上传中...' : `上传 (${pendingFiles.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
    </div>
  )
}

export default FilePage
