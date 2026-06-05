import { fileApi } from '../services/api.js'

function FilePreviewModal({ file, isOpen, onClose, onDownload }) {
  if (!isOpen || !file) return null

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{file.original_filename}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="preview-container">
            <img
              src={fileApi.previewFile(file.id)}
              alt={file.original_filename}
              className="preview-image"
            />
          </div>
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
