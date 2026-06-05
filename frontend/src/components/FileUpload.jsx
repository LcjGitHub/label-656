import { useState, useRef } from 'react'

function FileUpload({ onFilesSelected, maxFiles = 10 }) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    addFiles(files)
  }

  const addFiles = (files) => {
    const validFiles = files.filter(file => {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'md', 'csv', 'zip', 'rar', '7z']
      const ext = file.name.split('.').pop().toLowerCase()
      return allowedExtensions.includes(ext)
    })

    const newFiles = [...selectedFiles, ...validFiles].slice(0, maxFiles)
    setSelectedFiles(newFiles)
    onFilesSelected(newFiles)
  }

  const removeFile = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(newFiles)
    onFilesSelected(newFiles)
  }

  const clearFiles = () => {
    setSelectedFiles([])
    onFilesSelected([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
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

  return (
    <div className="file-upload-container">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar,.7z"
        />
        <div className="drop-zone-content">
          <div className="drop-icon">📤</div>
          <h3>拖拽文件到此处上传</h3>
          <p>或者点击选择文件</p>
          <p className="drop-hint">支持图片、文档、压缩包等，单个文件最大 50MB</p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <div className="selected-files-header">
            <h4>已选择 {selectedFiles.length} 个文件</h4>
            <button className="btn-clear" onClick={clearFiles}>
              清空
            </button>
          </div>
          <div className="file-list">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <span className="file-icon">{getFileIcon(file.name)}</span>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                </div>
                <button
                  className="btn-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default FileUpload
