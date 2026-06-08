import { useState, useRef, useEffect } from 'react'
import { noteApi, parseBlobError } from '../services/api.js'

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

const triggerDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
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
  onExportSuccess,
  onExportError,
  selectable = false,
  selected = false,
  onSelect,
  viewMode = 'all',
}) => {
  const [showPinPriority, setShowPinPriority] = useState(false)
  const [pinPriority, setPinPriority] = useState(note.pin_priority || 0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState('md')
  const [exportIncludeTags, setExportIncludeTags] = useState(true)
  const [exportIncludeMetadata, setExportIncludeMetadata] = useState(true)
  const exportMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportMenu])

  const handleExport = async () => {
    try {
      setExporting(true)
      const response = await noteApi.exportSingleNote(note.id, exportFormat, exportIncludeTags, exportIncludeMetadata)
      const ext = exportFormat
      const safeTitle = (note.title || 'note').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
      const filename = `${safeTitle}.${ext}`
      triggerDownload(response.data, filename)
      setShowExportMenu(false)
      if (onExportSuccess) {
        onExportSuccess(`成功导出笔记：${note.title || '无标题'}`)
      }
    } catch (err) {
      console.error('Error exporting note:', err)
      const msg = await parseBlobError(err)
      if (onExportError) {
        onExportError(msg)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleExportClick = (e) => {
    e.stopPropagation()
    setShowExportMenu(!showExportMenu)
  }

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
        onFavoriteToggle(response.data, viewMode)
      }
    } catch (err) {
      console.error('Error toggling favorite:', err)
      alert('操作失败，请稍后重试')
    }
  }

  const handlePinToggle = async (e, priority = 0) => {
    e.stopPropagation()
    try {
      const response = await noteApi.togglePin(note.id, priority)
      if (onPinToggle) {
        onPinToggle(response.data, viewMode)
      }
      setShowPinPriority(false)
    } catch (err) {
      console.error('Error toggling pin:', err)
      alert('操作失败，请稍后重试')
    }
  }

  const handlePinClick = (e) => {
    e.stopPropagation()
    if (note.is_pinned === 1) {
      handlePinToggle(e, 0)
    } else {
      setPinPriority(note.pin_priority || 0)
      setShowPinPriority(true)
    }
  }

  const handleConfirmPin = (e) => {
    handlePinToggle(e, pinPriority)
  }

  const handleCancelPin = (e) => {
    e.stopPropagation()
    setShowPinPriority(false)
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

  const isPinned = note.is_pinned === 1
  const isFavorited = note.is_favorited === 1

  return (
    <div className={`note-card ${isPinned ? 'pinned' : ''} ${isFavorited ? 'favorited' : ''} ${selected ? 'selected' : ''}`}>
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
          {isPinned && (
            <span className="pin-indicator" title={`已置顶 (优先级: ${note.pin_priority})`}>
              📌
              {note.pin_priority > 0 && <span className="pin-priority-badge">{note.pin_priority}</span>}
            </span>
          )}
          {note.title && note.title.trim()
            ? highlightText(note.title, searchKeyword)
            : <span style={{ color: '#95a5a6', fontStyle: 'italic' }}>无标题</span>
          }
        </h3>
        <div className="note-actions">
          <button
            className={`btn-icon ${isFavorited ? 'active' : ''}`}
            onClick={handleFavoriteToggle}
            title={isFavorited ? '取消收藏' : '收藏'}
          >
            {isFavorited ? '⭐' : '☆'}
          </button>
          <div className="pin-action-wrapper">
            <button
              className={`btn-icon ${isPinned ? 'active' : ''}`}
              onClick={handlePinClick}
              title={isPinned ? '取消置顶' : '置顶'}
            >
              {isPinned ? '📌' : '📍'}
            </button>
            {showPinPriority && (
              <div className="pin-priority-popup" onClick={(e) => e.stopPropagation()}>
                <div className="pin-priority-title">设置置顶优先级</div>
                <div className="pin-priority-desc">数值越大越靠前</div>
                <div className="pin-priority-input-wrapper">
                  <input
                    type="number"
                    className="pin-priority-input"
                    value={pinPriority}
                    onChange={(e) => setPinPriority(Math.max(0, parseInt(e.target.value) || 0))}
                    min="0"
                    max="999"
                    autoFocus
                  />
                </div>
                <div className="pin-priority-presets">
                  {[0, 1, 2, 3, 5, 10].map(p => (
                    <button
                      key={p}
                      className={`pin-priority-preset ${pinPriority === p ? 'active' : ''}`}
                      onClick={() => setPinPriority(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="pin-priority-actions">
                  <button className="btn btn-secondary btn-tiny" onClick={handleCancelPin}>
                    取消
                  </button>
                  <button className="btn btn-primary btn-tiny" onClick={handleConfirmPin}>
                    确定
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="export-action-wrapper" ref={exportMenuRef}>
            <button
              className="btn btn-export"
              onClick={handleExportClick}
              title="导出笔记"
              disabled={exporting}
            >
              {exporting ? '导出中...' : '📤 导出'}
            </button>
            {showExportMenu && (
              <div className="export-menu-popup" onClick={(e) => e.stopPropagation()}>
                <div className="export-menu-title">导出设置</div>

                <div className="export-menu-section">
                  <div className="export-menu-label">导出格式</div>
                  <div className="export-format-options">
                    <label className={`export-format-option ${exportFormat === 'md' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="exportFormat"
                        value="md"
                        checked={exportFormat === 'md'}
                        onChange={(e) => setExportFormat(e.target.value)}
                      />
                      <span>Markdown 格式</span>
                    </label>
                    <label className={`export-format-option ${exportFormat === 'txt' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="exportFormat"
                        value="txt"
                        checked={exportFormat === 'txt'}
                        onChange={(e) => setExportFormat(e.target.value)}
                      />
                      <span>纯文本格式</span>
                    </label>
                  </div>
                </div>

                <div className="export-menu-section">
                  <label className="export-checkbox-option">
                    <input
                      type="checkbox"
                      checked={exportIncludeTags}
                      onChange={(e) => setExportIncludeTags(e.target.checked)}
                    />
                    <span>包含标签</span>
                  </label>
                  <label className="export-checkbox-option">
                    <input
                      type="checkbox"
                      checked={exportIncludeMetadata}
                      onChange={(e) => setExportIncludeMetadata(e.target.checked)}
                    />
                    <span>包含元数据（创建时间、收藏状态等）</span>
                  </label>
                </div>

                <div className="export-menu-actions">
                  <button
                    className="btn btn-secondary btn-tiny"
                    onClick={(e) => { e.stopPropagation(); setShowExportMenu(false); }}
                  >
                    取消
                  </button>
                  <button
                    className="btn btn-primary btn-tiny"
                    onClick={(e) => { e.stopPropagation(); handleExport(); }}
                    disabled={exporting}
                  >
                    {exporting ? '导出中...' : '确认导出'}
                  </button>
                </div>
              </div>
            )}
          </div>
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
        {isFavorited && note.favorited_at && (
          <span>⭐ 收藏: {formatDate(note.favorited_at)}</span>
        )}
        {isPinned && note.pinned_at && (
          <span>📌 置顶 (优先级 {note.pin_priority}): {formatDate(note.pinned_at)}</span>
        )}
      </div>
    </div>
  )
}

export default NoteCard
