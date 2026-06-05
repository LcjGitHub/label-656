import { noteApi } from '../services/api.js'

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const getContrastColor = (hexColor) => {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}

const NoteCard = ({
  note,
  searchKeyword,
  onEdit,
  onDelete,
  onRemoveTag,
  onTagClick,
  onFavoriteToggle,
  onPinToggle,
  selectable = false,
  selected = false,
  onSelect,
}) => {
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const highlightText = (text, keyword) => {
    if (!keyword) return text
    const escapedKeyword = escapeRegExp(keyword)
    const regex = new RegExp(`(${escapedKeyword})`, 'gi')
    const parts = text.split(regex)
    const keywordLower = keyword.toLowerCase()
    return parts.map((part, index) =>
      part.toLowerCase() === keywordLower ? (
        <span key={index} className="highlight">{part}</span>
      ) : (
        part
      )
    )
  }

  const handleFavoriteToggle = async (e) => {
    e.stopPropagation()
    try {
      const response = await noteApi.toggleFavorite(note.id)
      if (onFavoriteToggle) {
        onFavoriteToggle(response.data)
      }
    } catch (err) {
      console.error('Error toggling favorite:', err)
      alert('操作失败，请稍后重试')
    }
  }

  const handlePinToggle = async (e) => {
    e.stopPropagation()
    try {
      const response = await noteApi.togglePin(note.id)
      if (onPinToggle) {
        onPinToggle(response.data)
      }
    } catch (err) {
      console.error('Error toggling pin:', err)
      alert('操作失败，请稍后重试')
    }
  }

  const handleRemoveTag = async (tagId, e) => {
    e.stopPropagation()
    if (!window.confirm('确定要从这条笔记中移除该标签吗？')) return
    try {
      await noteApi.removeTag(note.id, tagId)
      if (onRemoveTag) {
        onRemoveTag(note.id, tagId)
      }
    } catch (err) {
      console.error('Error removing tag:', err)
      alert('移除标签失败，请稍后重试')
    }
  }

  const handleTagClick = (tag, e) => {
    e.stopPropagation()
    if (onTagClick) {
      onTagClick(tag)
    }
  }

  const handleSelect = (e) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(note.id, e.target.checked)
    }
  }

  return (
    <div className={`note-card ${note.is_pinned ? 'pinned' : ''} ${note.is_favorited ? 'favorited' : ''} ${selected ? 'selected' : ''}`}>
      {selectable && (
        <div className="note-checkbox">
          <input
            type="checkbox"
            checked={selected}
            onChange={handleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="note-header">
        <h3 className="note-title">
          {note.is_pinned && <span className="pin-indicator" title="已置顶">📌</span>}
          {note.title && note.title.trim()
            ? highlightText(note.title, searchKeyword)
            : <span style={{ color: '#95a5a6', fontStyle: 'italic' }}>无标题</span>
          }
        </h3>
        <div className="note-actions">
          <button
            className={`btn-icon ${note.is_favorited ? 'active' : ''}`}
            onClick={handleFavoriteToggle}
            title={note.is_favorited ? '取消收藏' : '收藏'}
          >
            {note.is_favorited ? '⭐' : '☆'}
          </button>
          <button
            className={`btn-icon ${note.is_pinned ? 'active' : ''}`}
            onClick={handlePinToggle}
            title={note.is_pinned ? '取消置顶' : '置顶'}
          >
            {note.is_pinned ? '📌' : '📍'}
          </button>
          <button className="btn btn-edit" onClick={(e) => { e.stopPropagation(); onEdit(note); }}>
            编辑
          </button>
          <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}>
            删除
          </button>
        </div>
      </div>
      <p className="note-content">
        {highlightText(note.content, searchKeyword)}
      </p>
      {note.tags && note.tags.length > 0 && (
        <div className="note-tags">
          {note.tags.map((tag) => (
            <span
              key={tag.id}
              className="tag-badge removable clickable"
              style={{
                backgroundColor: tag.color,
                color: getContrastColor(tag.color),
              }}
              onClick={(e) => handleTagClick(tag, e)}
              title={`点击筛选此标签的笔记`}
            >
              {tag.name}
              <button
                type="button"
                className="tag-remove-btn"
                onClick={(e) => handleRemoveTag(tag.id, e)}
                aria-label="移除标签"
                title="从笔记中移除该标签"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="note-meta">
        <span>创建: {formatDate(note.created_at)}</span>
        {note.updated_at && (
          <span>更新: {formatDate(note.updated_at)}</span>
        )}
        {note.favorited_at && note.is_favorited && (
          <span>收藏: {formatDate(note.favorited_at)}</span>
        )}
        {note.pinned_at && note.is_pinned && (
          <span>置顶: {formatDate(note.pinned_at)}</span>
        )}
      </div>
    </div>
  )
}

export default NoteCard
