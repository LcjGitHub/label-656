import { useState, useEffect } from 'react'

const NoteModal = ({ isOpen, onClose, onSubmit, note, error }) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [localError, setLocalError] = useState('')
  const isEditing = !!note

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.content)
    } else {
      setTitle('')
      setContent('')
    }
    setLocalError('')
  }, [note, isOpen])

  useEffect(() => {
    if (error && isOpen) {
      setLocalError(error)
    }
  }, [error, isOpen])

  const validateForm = () => {
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()

    if (!trimmedTitle) {
      setLocalError('标题不能为空或仅包含空格')
      return false
    }
    if (trimmedTitle.length > 200) {
      setLocalError('标题长度不能超过200个字符')
      return false
    }
    if (!trimmedContent) {
      setLocalError('内容不能为空或仅包含空格')
      return false
    }
    if (trimmedContent.length > 2000) {
      setLocalError('内容长度不能超过2000个字符')
      return false
    }
    setLocalError('')
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }
    onSubmit({ title: title.trim(), content: content.trim() })
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? '编辑笔记' : '新建笔记'}</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>
        {localError && <div className="error-message">{localError}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">标题</label>
            <input
              id="title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入笔记标题"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="content">内容</label>
            <textarea
              id="content"
              className="form-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请输入笔记内容"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NoteModal
