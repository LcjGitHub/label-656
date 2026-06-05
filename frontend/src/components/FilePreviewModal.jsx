import { useState, useEffect } from 'react'
import { fileApi } from '../services/api.js'

function FilePreviewModal({ file, isOpen, onClose, onDownload, onError }) {
  const [previewData, setPreviewData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState(null)

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

  const isImage = (ext) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
    return imageExts.includes(ext)
  }

  const isTextDocument = (ext) => {
    const textExts = ['txt', 'md']
    return textExts.includes(ext)
  }

  const isTableDocument = (ext) => {
    const tableExts = ['csv', 'xls', 'xlsx']
    return tableExts.includes(ext)
  }

  useEffect(() => {
    if (isOpen && file) {
      loadPreview()
    }
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [isOpen, file?.id])

  const loadPreview = async () => {
    if (!file) return

    setLoading(true)
    setPreviewData(null)
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      setImageUrl(null)
    }

    try {
      if (isImage(file.file_extension)) {
        const response = await fileApi.getImageBlob(file.id)
        if (response.data) {
          const url = URL.createObjectURL(response.data)
          setImageUrl(url)
        }
      } else if (isTextDocument(file.file_extension) || isTableDocument(file.file_extension)) {
        const response = await fileApi.previewDocument(file.id)
        setPreviewData(response.data)
      }
    } catch (err) {
      console.error('加载预览失败:', err)
      if (onError) {
        if (err.response && err.response.data && err.response.data.detail) {
          onError(`预览失败: ${err.response.data.detail}`)
        } else {
          onError('加载预览失败，请稍后重试')
        }
      }
    } finally {
      setLoading(false)
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
          onError(`下载文件失败，请稍后重试`)
        }
      }
    }
  }

  if (!isOpen || !file) return null

  const renderPreviewContent = () => {
    if (loading) {
      return (
        <div className="preview-container preview-loading">
          <p>⏳ 加载中...</p>
        </div>
      )
    }

    if (isImage(file.file_extension) && imageUrl) {
      return (
        <div className="preview-container">
          <img
            src={imageUrl}
            alt={file.original_filename}
            className="preview-image"
          />
        </div>
      )
    }

    if (previewData) {
      if (previewData.content_type === 'text') {
        return (
          <div className="preview-container text-preview">
            <pre className="text-content">{previewData.content}</pre>
          </div>
        )
      }

      if (previewData.content_type === 'table') {
        return (
          <div className="preview-container table-preview">
            {previewData.total_rows !== undefined && (
              <p className="table-info">
                共 {previewData.total_rows} 行数据，{previewData.total_columns} 列
                {previewData.total_rows > previewData.rows.length && ` (仅显示前 ${previewData.rows.length} 行)`}
              </p>
            )}
            <div className="table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    {previewData.headers?.map((header, idx) => (
                      <th key={idx}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows?.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    }

    return (
      <div className="preview-container preview-error">
        <p>❌ 无法加载预览</p>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{file.original_filename}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {renderPreviewContent()}
          <div className="file-details">
            <div className="detail-item">
              <span className="detail-label">文件大小：</span>
              <span className="detail-value">{formatFileSize(file.file_size)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">文件类型：</span>
              <span className="detail-value">{file.file_type}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">上传时间：</span>
              <span className="detail-value">{formatDate(file.uploaded_at)}</span>
            </div>
            {file.uploader_name && (
              <div className="detail-item">
                <span className="detail-label">上传者：</span>
                <span className="detail-value">{file.uploader_name}</span>
              </div>
            )}
            <div className="detail-item">
              <span className="detail-label">文件ID：</span>
              <span className="detail-value">{file.id}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            ⬇️ 下载
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilePreviewModal
