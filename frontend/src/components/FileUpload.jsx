import { useState, useRef, useEffect } from 'react'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'csv', 'zip', 'rar', '7z']

function FileUpload({ onFilesSelected, maxFiles = 10, onError }) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (validationErrors.length > 0 && onError) {
      const errorMessage = validationErrors.join('；')
      onError(errorMessage)
      const timer = setTimeout(() => {
        setValidationErrors([])
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [validationErrors])

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

  const validateFile = (file) => {
    const errors = []
    const ext = file.name.split('.').pop().toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`文件 "${file.name}" 类型不支持，仅支持 ${ALLOWED_EXTENSIONS.join(', ')} 格式`)
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`文件 "${file.name}" 超过大小限制 (50MB)，当前大小 ${formatFileSize(file.size)}`)
    }

    return errors
  }

  const addFiles = (files) => {
    const errors = []
    const validFiles = []

    for (const file of files) {
      const fileErrors = validateFile(file)
      if (fileErrors.length > 0) {
        errors.push(...fileErrors)
      } else {
        validFiles.push(file)
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
    }

    if (validFiles.length > 0) {
      const newFiles = [...selectedFiles, ...validFiles].slice(0, maxFiles)
      setSelectedFiles(newFiles)
      onFilesSelected(newFiles)

      if (selectedFiles.length + validFiles.length > maxFiles) {
        errors.push(`最多只能上传 ${maxFiles} 个文件，超出部分已被忽略`)
        setValidationErrors(errors)
      }
    } else if (errors.length === 0) {
      setValidationErrors(['没有可添加的有效文件'])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(newFiles)
    onFilesSelected(newFiles)
  }

  const clearFiles = () => {
    setSelectedFiles([])
    onFilesSelected([])
    setValidationErrors([])
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
      {validationErrors.length > 0 && (
        <div className="upload-errors">
          {validationErrors.map((error, index) => (
            <div key={index} className="upload-error-item">
              ⚠️ {error}
            </div>
          ))}
        </div>
      )}

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
