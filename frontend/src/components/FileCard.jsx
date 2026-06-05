import { useState } from 'react'
import { fileApi } from '../services/api.js'

function FileCard({ file, isSelected, onSelect, onPreview, onDelete, onDownload }) {
  const [showMenu, setShowMenu] = useState(false)

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
    }
  }

  const handleDelete = () => {
    if (window.confirm(`确定要删除文件 "${file.original_filename}" 吗？`)) {
      onDelete(file.id)
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
        onClick={() => isImage(file.file_extension) && onPreview(file)}
      >
        {isImage(file.file_extension) ? (
          <img
            src={fileApi.previewFile(file.id)}
            alt={file.original_filename}
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={`file-icon-placeholder ${isImage(file.file_extension) ? 'hidden' : ''}`}
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
      </div>

      <div className="file-actions">
        {isImage(file.file_extension) && (
          <button
            className="btn-action"
            title="预览"
            onClick={() => onPreview(file)}
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
