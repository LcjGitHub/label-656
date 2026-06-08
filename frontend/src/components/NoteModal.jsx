import { useState, useEffect } from 'react'
import { tagApi } from '../services/api.js'
import RichTextEditor from './RichTextEditor.jsx'
import { htmlToPlainText } from '../utils/htmlUtils.js'

const DEFAULT_COLORS = [
  '#3498db',
  '#e74c3c',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#34495e',
  '#16a085',
  '#c0392b',
  '#8e44ad',
  '#27ae60',
]

const NoteModal = ({ isOpen, onClose, onSubmit, note, error, onTagsChange }) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState([])
  const [availableTags, setAvailableTags] = useState([])
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0])
  const [tagError, setTagError] = useState('')
  const [localError, setLocalError] = useState('')
  const isEditing = !!note

  const fetchTags = async () => {
    try {
      const response = await tagApi.getTags()
      setAvailableTags(response.data)
      if (onTagsChange) {
        onTagsChange(response.data)
      }
    } catch (err) {
      console.error('Error fetching tags:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchTags()
    }
  }, [isOpen])

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setContent(note.content)
      setSelectedTagIds(note.tags ? note.tags.map(t => t.id) : [])
    } else {
      setTitle('')
      setContent('')
      setSelectedTagIds([])
    }
    setLocalError('')
    setIsCreatingTag(false)
    setNewTagName('')
    setTagError('')
  }, [note, isOpen])

  useEffect(() => {
    if (error && isOpen) {
      setLocalError(error)
    }
  }, [error, isOpen])

  const toggleTag = (tagId) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const removeTag = (tagId, e) => {
    e.stopPropagation()
    setSelectedTagIds(prev => prev.filter(id => id !== tagId))
  }

  const handleCreateTag = async (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!newTagName.trim()) {
      setTagError('标签名称不能为空')
      return
    }
    try {
      setTagError('')
      const response = await tagApi.createTag({ name: newTagName.trim(), color: newTagColor })
      const newTag = response.data
      setAvailableTags(prev => [...prev, newTag])
      setSelectedTagIds(prev => [...prev, newTag.id])
      setNewTagName('')
      setNewTagColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)])
      setIsCreatingTag(false)
      if (onTagsChange) {
        const allTags = await tagApi.getTags()
        onTagsChange(allTags.data)
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setTagError(err.response.data.detail)
      } else {
        setTagError('创建标签失败')
      }
      console.error('Error creating tag:', err)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleCreateTag()
    }
  }

  const validateForm = () => {
    const trimmedTitle = title.trim()
    const plainContent = htmlToPlainText(content).trim()

    if (!trimmedTitle) {
      setLocalError('标题不能为空或仅包含空格')
      return false
    }
    if (trimmedTitle.length > 200) {
      setLocalError('标题长度不能超过200个字符')
      return false
    }
    if (!plainContent) {
      setLocalError('内容不能为空或仅包含空格')
      return false
    }
    if (plainContent.length > 2000) {
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
    onSubmit({
      title: title.trim(),
      content: content.trim(),
      tag_ids: selectedTagIds,
    })
  }

  const getContrastColor = (hexColor) => {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 128 ? '#000000' : '#ffffff'
  }

  const selectedTags = availableTags.filter(t => selectedTagIds.includes(t.id))

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal note-modal" onClick={(e) => e.stopPropagation()}>
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
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="请输入笔记内容..."
            />
          </div>
          <div className="form-group">
            <label>
              标签
              <span className="label-hint">（点击选择，可多选）</span>
            </label>

            {selectedTags.length > 0 && (
              <div className="selected-tags">
                {selectedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="tag-badge removable"
                    style={{
                      backgroundColor: tag.color,
                      color: getContrastColor(tag.color),
                    }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      className="tag-remove-btn"
                      onClick={(e) => removeTag(tag.id, e)}
                      aria-label="移除标签"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="tag-selector">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag-select-btn ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
                  style={{
                    backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : 'transparent',
                    borderColor: tag.color,
                    color: selectedTagIds.includes(tag.id) ? getContrastColor(tag.color) : tag.color,
                  }}
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}

              {!isCreatingTag ? (
                <button
                  type="button"
                  className="tag-select-btn add-tag-btn"
                  onClick={() => setIsCreatingTag(true)}
                >
                  + 新建标签
                </button>
              ) : (
                <div className="create-tag-inline">
                  {tagError && <div className="error-message small">{tagError}</div>}
                  <div className="create-tag-form">
                    <div
                      className="color-preview small"
                      style={{ backgroundColor: newTagColor }}
                    />
                    <input
                      type="text"
                      className="form-input small"
                      placeholder="标签名称"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={50}
                      autoFocus
                    />
                    <div className="color-palette tiny">
                      {DEFAULT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-option ${newTagColor === color ? 'selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setNewTagColor(color)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-tiny"
                      onClick={handleCreateTag}
                    >
                      添加
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-tiny"
                      onClick={() => {
                        setIsCreatingTag(false)
                        setTagError('')
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
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
