import { useState, useEffect } from 'react'
import { tagApi } from '../services/api.js'

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

const TagManager = ({ isOpen, onClose, onTagsChange }) => {
  const [tags, setTags] = useState([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0])
  const [editingTag, setEditingTag] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchTags = async () => {
    try {
      setLoading(true)
      const response = await tagApi.getTags()
      setTags(response.data)
      if (onTagsChange) {
        onTagsChange(response.data)
      }
    } catch (err) {
      setError('加载标签失败')
      console.error('Error fetching tags:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchTags()
      setError('')
      setNewTagName('')
      setEditingTag(null)
    }
  }, [isOpen])

  const handleCreateTag = async (e) => {
    e.preventDefault()
    if (!newTagName.trim()) {
      setError('标签名称不能为空')
      return
    }
    try {
      setError('')
      await tagApi.createTag({ name: newTagName.trim(), color: newTagColor })
      setNewTagName('')
      setNewTagColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)])
      await fetchTags()
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('创建标签失败')
      }
      console.error('Error creating tag:', err)
    }
  }

  const handleEditTag = (tag) => {
    setEditingTag(tag)
    setEditName(tag.name)
    setEditColor(tag.color)
    setError('')
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingTag) return
    if (!editName.trim()) {
      setError('标签名称不能为空')
      return
    }
    try {
      setError('')
      await tagApi.updateTag(editingTag.id, { name: editName.trim(), color: editColor })
      setEditingTag(null)
      await fetchTags()
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('更新标签失败')
      }
      console.error('Error updating tag:', err)
    }
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
    setError('')
  }

  const handleDeleteTag = async (tagId) => {
    if (!window.confirm('确定要删除这个标签吗？删除后所有笔记中的该标签也会被移除。')) return
    try {
      setError('')
      await tagApi.deleteTag(tagId)
      await fetchTags()
    } catch (err) {
      setError('删除标签失败')
      console.error('Error deleting tag:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tag-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏷️ 标签管理</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="tag-create-section">
          <h3>创建新标签</h3>
          <form onSubmit={handleCreateTag} className="tag-create-form">
            <div className="color-picker-preview">
              <div
                className="color-preview"
                style={{ backgroundColor: newTagColor }}
              />
            </div>
            <input
              type="text"
              className="form-input tag-name-input"
              placeholder="输入标签名称"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              maxLength={50}
            />
            <div className="color-palette">
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
            <button type="submit" className="btn btn-primary">
              + 创建
            </button>
          </form>
        </div>

        <div className="tags-list-section">
          <h3>我的标签 ({tags.length})</h3>
          {loading ? (
            <div className="empty-state">
              <p>加载中...</p>
            </div>
          ) : tags.length === 0 ? (
            <div className="empty-state">
              <p>还没有标签，创建一个吧！</p>
            </div>
          ) : (
            <div className="tags-list">
              {tags.map((tag) => (
                <div key={tag.id} className="tag-item">
                  {editingTag && editingTag.id === tag.id ? (
                    <form onSubmit={handleSaveEdit} className="tag-edit-form">
                      <div
                        className="color-preview"
                        style={{ backgroundColor: editColor }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={50}
                        autoFocus
                      />
                      <div className="color-palette small">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`color-option ${editColor === color ? 'selected' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setEditColor(color)}
                          />
                        ))}
                      </div>
                      <div className="tag-edit-actions">
                        <button type="submit" className="btn btn-primary btn-small">
                          保存
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={handleCancelEdit}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span
                        className="tag-badge"
                        style={{
                          backgroundColor: tag.color,
                          color: getContrastColor(tag.color),
                        }}
                      >
                        {tag.name}
                      </span>
                      <div className="tag-actions">
                        <button
                          className="btn btn-edit btn-small"
                          onClick={() => handleEditTag(tag)}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteTag(tag.id)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getContrastColor(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}

export default TagManager
