import { useState, useEffect } from 'react'
import { fileApi } from '../services/api.js'

function FileCard({ file, isSelected, onSelect, onPreview, onDelete, onDownload, onError }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFileIcon = (ext) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
    const docExts = ['doc', 'docx', 'pdf', 'txt', 'md']
    const sheetExts = ['xls', 'xlsx', 'csv']
    const slideExts = ['ppt', 'pptx']
    const archiveExts = ['zip', 'rar', '7z']

    if (imageExts.includes(ext)) return '🖼️'
    if (docExts.includes(ext)) return '📄'
    if (sheetExts.includes(ext)) return '📊'
    if (slideExts.includes(ext)) return '📽️'
    if (archiveExts.includes(ext)) return '📦'
    return '📁'
  }

  const isImage = (ext) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
    return imageExts.includes(ext)
  }

  const isDocumentPreviewable = (ext) => {
    const previewableExts = ['txt', 'md', 'csv', 'xls', 'xlsx']
    return previewableExts.includes(ext)
  }

  useEffect(() => {
    let isMounted = true

    if (isImage(file.file_extension)) {
      loadImage()
    }

    return () => {
      isMounted = false
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [file.id])

  const loadImage = async () => {
    try {
      setImageLoading(true)
      const response = await fileApi.getImageBlob(file.id)
      if (response.data) {
        const url = URL.createObjectURL(response.data)
        setImageUrl(url)
      }
    } catch (err) {
      console.error('加载图片失败:', err)
      if (onError) {
        onError(`加载图片 "${file.original_filename}" 失败`)
      }
    } finally {
      setImageLoading(false)
    }
  }

  const handleDownload = async () => {
    try {
      const response = await fileApi.downloadFile(file.id)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', file.original_filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      onDownload && onDownload(file)
    } catch (err) {
      console.error('下载文件失败:', err)
      if (onError) {
        if (err.response && err.response.data && err.response.data.detail) {
          onError(`下载失败: ${err.response.data.detail}`)
        } else {
          onError(`下载文件 "${file.original_filename}" 失败，请稍后重试`)
        }
      }
    }
  }

  const handleDelete = () => {
    if (window.confirm(`确定要删除文件 "${file.original_filename}" 吗？`)) {
      onDelete(file.id)
    }
  }

  const handlePreviewClick = () => {
    if (isImage(file.file_extension) || isDocumentPreviewable(file.file_extension)) {
      onPreview(file)
    }
  }

  return (
    <div className={`file-card ${isSelected ? 'selected' : ''}`}>
      <div className="file-checkbox" onClick={(e) => {
        e.stopPropagation()
        onSelect(file.id)
      }}>
        <input type="checkbox" checked={isSelected} readOnly />
      </div>

      <div
        className="file-preview"
        onClick={handlePreviewClick}
      >
        {isImage(file.file_extension) && imageUrl ? (
          <img
            src={imageUrl}
            alt={file.original_filename}
            onError={(e) => {
              e.target.style.display = 'none'
              if (e.target.nextSibling) {
                e.target.nextSibling.style.display = 'flex'
              }
            }}
          />
        ) : null}
        {isImage(file.file_extension) && imageLoading && (
          <div className="file-loading">⏳</div>
        )}
        <div
          className={`file-icon-placeholder ${isImage(file.file_extension) && imageUrl ? 'hidden' : ''}`}
        >
          {getFileIcon(file.file_extension)}
        </div>
      </div>

      <div className="file-info">
        <h4 className="file-name" title={file.original_filename}>
          {file.original_filename}
        </h4>
        <div className="file-meta">
          <span>{formatFileSize(file.file_size)}</span>
          <span>•</span>
          <span>{formatDate(file.uploaded_at)}</span>
        </div>
        {file.uploader_name && (
          <div className="file-uploader">
            👤 {file.uploader_name}
          </div>
        )}
      </div>

      <div className="file-actions">
        {(isImage(file.file_extension) || isDocumentPreviewable(file.file_extension)) && (
          <button
            className="btn-action"
            title="预览"
            onClick={handlePreviewClick}
          >
            👁️
          </button>
        )}
        <button
          className="btn-action"
          title="下载"
          onClick={handleDownload}
        >
          ⬇️
        </button>
        <button
          className="btn-action btn-danger"
          title="删除"
          onClick={handleDelete}
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

export default FileCard
