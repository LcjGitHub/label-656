import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import NoteCard from './components/NoteCard.jsx'
import NoteModal from './components/NoteModal.jsx'
import TagManager from './components/TagManager.jsx'
import { noteApi, tagApi } from './services/api.js'
import { useAuth } from './context/AuthContext.jsx'

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

function App() {
  const [notes, setNotes] = useState([])
  const [allNotes, setAllNotes] = useState([])
  const [tags, setTags] = useState([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedTagId, setSelectedTagId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [loading, setLoading] = useState(true)
  const [allNotesLoading, setAllNotesLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const { user, logout } = useAuth()
  const location = useLocation()

  const [viewMode, setViewMode] = useState('all')
  const [selectedNoteIds, setSelectedNoteIds] = useState([])
  const [selectMode, setSelectMode] = useState(false)
  const [showBatchPinPriority, setShowBatchPinPriority] = useState(false)
  const [batchPinPriority, setBatchPinPriority] = useState(0)

  const [successMessage, setSuccessMessage] = useState('')
  const [showBatchExportModal, setShowBatchExportModal] = useState(false)
  const [batchExportFormat, setBatchExportFormat] = useState('md')
  const [batchExportIncludeTags, setBatchExportIncludeTags] = useState(true)
  const [batchExportIncludeMetadata, setBatchExportIncludeMetadata] = useState(true)
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchExportProgress, setBatchExportProgress] = useState(0)
  const [exportAll, setExportAll] = useState(false)
  const batchExportModalRef = useRef(null)

  const fetchAllNotes = async () => {
    try {
      setAllNotesLoading(true)
      const response = await noteApi.getNotes('', null, false, false)
      setAllNotes(response.data)
    } catch (err) {
      console.error('Error fetching all notes:', err)
    } finally {
      setAllNotesLoading(false)
    }
  }

  const fetchNotes = async (search = '', tagId = null) => {
    try {
      setLoading(true)
      setError('')
      let response
      if (viewMode === 'favorites') {
        response = await noteApi.getFavoriteNotes(search, tagId)
      } else if (viewMode === 'pinned') {
        response = await noteApi.getPinnedNotes(search, tagId)
      } else {
        response = await noteApi.getNotes(search, tagId, false, false)
      }
      setNotes(response.data)
    } catch (err) {
      setError('加载笔记失败，请稍后重试')
      console.error('Error fetching notes:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTags = async () => {
    try {
      setTagsLoading(true)
      const response = await tagApi.getTags()
      setTags(response.data)
    } catch (err) {
      console.error('Error fetching tags:', err)
    } finally {
      setTagsLoading(false)
    }
  }

  const refreshAllData = async () => {
    await Promise.all([
      fetchAllNotes(),
      fetchNotes(searchKeyword, selectedTagId),
      fetchTags(),
    ])
  }

  useEffect(() => {
    fetchNotes(searchKeyword, selectedTagId)
  }, [searchKeyword, selectedTagId, viewMode])

  useEffect(() => {
    fetchAllNotes()
    fetchTags()
  }, [])

  const handleSearch = (e) => {
    setSearchKeyword(e.target.value)
    setNotes([])
    setLoading(true)
  }

  const handleTagFilter = (tagId) => {
    setSelectedTagId(tagId === selectedTagId ? null : tagId)
    setNotes([])
    setLoading(true)
  }

  const handleTagClick = (tag) => {
    handleTagFilter(tag.id)
  }

  const handleCreateNote = () => {
    setEditingNote(null)
    setIsModalOpen(true)
  }

  const handleEditNote = (note) => {
    setEditingNote(note)
    setIsModalOpen(true)
  }

  const handleDeleteNote = async (id) => {
    if (!window.confirm('确定要删除这条笔记吗？')) return

    try {
      setError('')
      await noteApi.deleteNote(id)
      setSelectedNoteIds(prev => prev.filter(noteId => noteId !== id))
      await Promise.all([
        fetchAllNotes(),
        fetchNotes(searchKeyword, selectedTagId),
      ])
    } catch (err) {
      setError('删除笔记失败，请稍后重试')
      console.error('Error deleting note:', err)
    }
  }

  const handleRemoveTag = async (noteId, tagId) => {
    setNotes(prevNotes =>
      prevNotes.map(note => {
        if (note.id === noteId) {
          return {
            ...note,
            tags: note.tags.filter(t => t.id !== tagId)
          }
        }
        return note
      })
    )
    setAllNotes(prevAllNotes =>
      prevAllNotes.map(note => {
        if (note.id === noteId) {
          return {
            ...note,
            tags: note.tags.filter(t => t.id !== tagId)
          }
        }
        return note
      })
    )
  }

  const handleFavoriteToggle = (updatedNote, currentViewMode) => {
    const isFavorited = updatedNote.is_favorited === 1
    setAllNotes(prevAllNotes =>
      prevAllNotes.map(note =>
        note.id === updatedNote.id ? updatedNote : note
      )
    )
    if (currentViewMode === 'favorites' && !isFavorited) {
      setNotes(prevNotes =>
        prevNotes.filter(note => note.id !== updatedNote.id)
      )
    } else {
      setNotes(prevNotes =>
        prevNotes.map(note =>
          note.id === updatedNote.id ? updatedNote : note
        )
      )
    }
  }

  const handlePinToggle = (updatedNote, currentViewMode) => {
    const isPinned = updatedNote.is_pinned === 1
    setAllNotes(prevAllNotes =>
      prevAllNotes.map(note =>
        note.id === updatedNote.id ? updatedNote : note
      )
    )
    if (currentViewMode === 'pinned' && !isPinned) {
      setNotes(prevNotes =>
        prevNotes.filter(note => note.id !== updatedNote.id)
      )
    } else {
      setNotes(prevNotes => {
        const newNotes = prevNotes.map(note =>
          note.id === updatedNote.id ? updatedNote : note
        )
        return newNotes.sort((a, b) => {
          const aPinned = a.is_pinned === 1 ? 1 : 0
          const bPinned = b.is_pinned === 1 ? 1 : 0
          if (bPinned !== aPinned) return bPinned - aPinned
          if (b.pin_priority !== a.pin_priority) return b.pin_priority - a.pin_priority
          return 0
        })
      })
    }
  }

  const handleSelectNote = (noteId, checked) => {
    setSelectedNoteIds(prev => {
      if (checked) {
        return [...prev, noteId]
      } else {
        return prev.filter(id => id !== noteId)
      }
    })
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedNoteIds(notes.map(note => note.id))
    } else {
      setSelectedNoteIds([])
    }
  }

  const handleBatchFavorite = async (isFavorited) => {
    if (selectedNoteIds.length === 0) {
      alert('请先选择要操作的笔记')
      return
    }
    const action = isFavorited ? '收藏' : '取消收藏'
    if (!window.confirm(`确定要${action}选中的 ${selectedNoteIds.length} 条笔记吗？`)) return

    try {
      setError('')
      const response = await noteApi.batchSetFavorite(selectedNoteIds, isFavorited)
      const updatedNotes = response.data
      setNotes(prevNotes => {
        const noteMap = new Map(updatedNotes.map(n => [n.id, n]))
        return prevNotes.map(note => noteMap.get(note.id) || note)
      })
      setAllNotes(prevAllNotes => {
        const noteMap = new Map(updatedNotes.map(n => [n.id, n]))
        return prevAllNotes.map(note => noteMap.get(note.id) || note)
      })
      if (!isFavorited && viewMode === 'favorites') {
        await fetchNotes(searchKeyword, selectedTagId)
      }
      setSelectedNoteIds([])
      setSelectMode(false)
      alert(`成功${action} ${updatedNotes.length} 条笔记`)
    } catch (err) {
      setError(`批量${action}失败，请稍后重试`)
      console.error('Error batch favorite:', err)
    }
  }

  const handleBatchPinClick = (isPinned) => {
    if (selectedNoteIds.length === 0) {
      alert('请先选择要操作的笔记')
      return
    }
    if (isPinned) {
      setBatchPinPriority(0)
      setShowBatchPinPriority(true)
    } else {
      handleBatchPin(false, 0)
    }
  }

  const handleBatchPin = async (isPinned, priority = 0) => {
    const action = isPinned ? '置顶' : '取消置顶'
    if (!window.confirm(`确定要${action}选中的 ${selectedNoteIds.length} 条笔记吗？`)) return

    try {
      setError('')
      const response = await noteApi.batchSetPin(selectedNoteIds, isPinned, priority)
      const updatedNotes = response.data
      setAllNotes(prevAllNotes => {
        const noteMap = new Map(updatedNotes.map(n => [n.id, n]))
        return prevAllNotes.map(note => noteMap.get(note.id) || note)
      })
      if (!isPinned && viewMode === 'pinned') {
        await fetchNotes(searchKeyword, selectedTagId)
      } else {
        setNotes(prevNotes => {
          const noteMap = new Map(updatedNotes.map(n => [n.id, n]))
          return prevNotes.map(note => noteMap.get(note.id) || note)
            .sort((a, b) => {
              const aPinned = a.is_pinned === 1 ? 1 : 0
              const bPinned = b.is_pinned === 1 ? 1 : 0
              if (bPinned !== aPinned) return bPinned - aPinned
              if (b.pin_priority !== a.pin_priority) return b.pin_priority - a.pin_priority
              return 0
            })
        })
      }
      setSelectedNoteIds([])
      setSelectMode(false)
      setShowBatchPinPriority(false)
      alert(`成功${action} ${updatedNotes.length} 条笔记`)
    } catch (err) {
      setError(`批量${action}失败，请稍后重试`)
      console.error('Error batch pin:', err)
    }
  }

  const handleUnpinAll = async () => {
    const pinnedCount = allNotes.filter(n => n.is_pinned).length
    if (pinnedCount === 0) {
      alert('没有置顶的笔记')
      return
    }
    if (!window.confirm(`确定要取消全部 ${pinnedCount} 条笔记的置顶吗？`)) return

    try {
      setError('')
      const response = await noteApi.unpinAll()
      await refreshAllData()
      setSelectedNoteIds([])
      setSelectMode(false)
      alert(response.data.message)
    } catch (err) {
      setError('取消全部置顶失败，请稍后重试')
      console.error('Error unpin all:', err)
    }
  }

  const handleBatchUnfavorite = async () => {
    if (selectedNoteIds.length === 0) {
      alert('请先选择要取消收藏的笔记')
      return
    }
    if (!window.confirm(`确定要取消收藏选中的 ${selectedNoteIds.length} 条笔记吗？`)) return

    try {
      setError('')
      const response = await noteApi.batchUnfavorite(selectedNoteIds)
      setAllNotes(prevAllNotes =>
        prevAllNotes.map(note =>
          selectedNoteIds.includes(note.id)
            ? { ...note, is_favorited: 0, favorited_at: null }
            : note
        )
      )
      if (viewMode === 'favorites') {
        await fetchNotes(searchKeyword, selectedTagId)
      } else {
        setNotes(prevNotes =>
          prevNotes.map(note =>
            selectedNoteIds.includes(note.id)
              ? { ...note, is_favorited: 0, favorited_at: null }
              : note
          )
        )
      }
      setSelectedNoteIds([])
      setSelectMode(false)
      alert(response.data.message)
    } catch (err) {
      setError('批量取消收藏失败，请稍后重试')
      console.error('Error batch unfavorite:', err)
    }
  }

  const handleSubmitNote = async (noteData) => {
    try {
      setModalError('')
      if (editingNote) {
        await noteApi.updateNote(editingNote.id, noteData)
      } else {
        await noteApi.createNote(noteData)
      }
      await refreshAllData()
      setIsModalOpen(false)
      setEditingNote(null)
      setModalError('')
    } catch (err) {
      if (err.response && err.response.data && err.response.data.detail) {
        setModalError(err.response.data.detail)
      } else {
        setModalError('保存笔记失败，请稍后重试')
      }
      console.error('Error saving note:', err)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingNote(null)
    setModalError('')
  }

  const handleTagsChange = (newTags) => {
    setTags(newTags)
  }

  const handleNoteModalTagsChange = (newTags) => {
    setTags(newTags)
    fetchAllNotes()
  }

  const handleTagManagerClose = async () => {
    setIsTagManagerOpen(false)
    await refreshAllData()
  }

  const handleLogout = async () => {
    if (window.confirm('确定要退出登录吗？')) {
      await logout()
    }
  }

  const getContrastColor = (hexColor) => {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness > 128 ? '#000000' : '#ffffff'
  }

  const getNoteCountForTag = (tagId) => {
    return allNotes.filter(note => note.tags && note.tags.some(t => t.id === tagId)).length
  }

  const getFavoriteCount = () => {
    return allNotes.filter(note => note.is_favorited).length
  }

  const getPinnedCount = () => {
    return allNotes.filter(note => note.is_pinned).length
  }

  const handleViewModeChange = (mode) => {
    setViewMode(mode)
    setSelectedNoteIds([])
    setSelectMode(false)
    setNotes([])
    setLoading(true)
  }

  const toggleSelectMode = () => {
    setSelectMode(!selectMode)
    setSelectedNoteIds([])
  }

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleExportSuccess = (message) => {
    setSuccessMessage(message)
  }

  const handleExportError = (message) => {
    setError(message)
  }

  const handleOpenBatchExport = () => {
    setBatchExportFormat('md')
    setBatchExportIncludeTags(true)
    setBatchExportIncludeMetadata(true)
    setBatchExportProgress(0)
    setExportAll(selectedNoteIds.length === 0)
    setShowBatchExportModal(true)
  }

  const handleBatchExport = async () => {
    try {
      setBatchExporting(true)
      setBatchExportProgress(20)
      setError('')

      const noteIds = exportAll ? null : selectedNoteIds
      const count = exportAll ? allNotes.length : selectedNoteIds.length

      const response = await noteApi.exportNotes(
        noteIds,
        batchExportFormat,
        batchExportIncludeTags,
        batchExportIncludeMetadata
      )

      setBatchExportProgress(60)

      const { filename, download_url } = response.data

      const downloadResponse = await noteApi.downloadExport(
        download_url.split('/').pop()
      )

      setBatchExportProgress(90)

      triggerDownload(downloadResponse.data, filename)

      setBatchExportProgress(100)
      setSuccessMessage(`成功导出 ${response.data.note_count} 条笔记`)
      setShowBatchExportModal(false)
      setSelectedNoteIds([])
      setSelectMode(false)
    } catch (err) {
      console.error('Error batch exporting notes:', err)
      const msg = err.response?.data?.detail || '批量导出失败，请稍后重试'
      setError(msg)
    } finally {
      setBatchExporting(false)
      setTimeout(() => setBatchExportProgress(0), 500)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>📝 笔记管理</h1>
            <p>记录你的想法，随时查看和编辑</p>
          </div>
          <nav className="main-nav">
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              📝 笔记
            </Link>
            <Link
              to="/files"
              className={`nav-link ${location.pathname === '/files' ? 'active' : ''}`}
            >
              📁 文件
            </Link>
          </nav>
          <div className="user-info">
            <span className="user-greeting">
              👤 {user?.full_name || user?.username}
            </span>
            <button className="btn btn-logout" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="view-tabs">
        <button
          className={`view-tab ${viewMode === 'all' ? 'active' : ''}`}
          onClick={() => handleViewModeChange('all')}
        >
          📝 全部笔记
          <span className="tab-count">{allNotes.length}</span>
        </button>
        <button
          className={`view-tab ${viewMode === 'favorites' ? 'active' : ''}`}
          onClick={() => handleViewModeChange('favorites')}
        >
          ⭐ 收藏笔记
          <span className="tab-count">{getFavoriteCount()}</span>
        </button>
        <button
          className={`view-tab ${viewMode === 'pinned' ? 'active' : ''}`}
          onClick={() => handleViewModeChange('pinned')}
        >
          📌 置顶笔记
          <span className="tab-count">{getPinnedCount()}</span>
        </button>
      </div>

      {!tagsLoading && tags.length > 0 && (
        <div className="tag-filter-section">
          <div className="tag-filter-header">
            <span className="tag-filter-title">🏷️ 标签筛选：</span>
            <button
              className={`filter-tag ${selectedTagId === null ? 'active' : ''}`}
              onClick={() => handleTagFilter(null)}
            >
              全部
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={`filter-tag ${selectedTagId === tag.id ? 'active' : ''}`}
                style={{
                  backgroundColor: selectedTagId === tag.id ? tag.color : 'transparent',
                  borderColor: tag.color,
                  color: selectedTagId === tag.id ? getContrastColor(tag.color) : tag.color,
                }}
                onClick={() => handleTagFilter(tag.id)}
              >
                {tag.name}
                <span className="tag-count">{getNoteCountForTag(tag.id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索笔记..."
          value={searchKeyword}
          onChange={handleSearch}
        />
        <button className="btn btn-secondary" onClick={toggleSelectMode}>
          {selectMode ? '❌ 取消选择' : '☑️ 批量操作'}
        </button>
        <button className="btn btn-secondary" onClick={() => setIsTagManagerOpen(true)}>
          🏷️ 管理标签
        </button>
        <button className="btn btn-primary" onClick={handleCreateNote}>
          + 新建笔记
        </button>
      </div>

      {selectMode && (
        <div className="batch-actions">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedNoteIds.length === notes.length && notes.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
            全选
          </label>
          <span className="selected-count">
            已选择 {selectedNoteIds.length} 条笔记
          </span>
          <button
            className="btn btn-primary btn-small"
            onClick={() => handleBatchFavorite(true)}
            disabled={selectedNoteIds.length === 0}
          >
            ⭐ 批量收藏
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => handleBatchFavorite(false)}
            disabled={selectedNoteIds.length === 0}
          >
            ☆ 取消收藏
          </button>
          <button
            className="btn btn-primary btn-small"
            onClick={() => handleBatchPinClick(true)}
            disabled={selectedNoteIds.length === 0}
          >
            📌 批量置顶
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={() => handleBatchPinClick(false)}
            disabled={selectedNoteIds.length === 0}
          >
            📍 取消置顶
          </button>
          <button
            className="btn btn-warning btn-small"
            onClick={handleUnpinAll}
            disabled={getPinnedCount() === 0}
          >
            🔽 取消全部置顶
          </button>
          <button
            className="btn btn-danger btn-small"
            onClick={handleBatchUnfavorite}
            disabled={selectedNoteIds.length === 0}
          >
            💔 批量取消收藏
          </button>
          <button
            className="btn btn-success btn-small"
            onClick={handleOpenBatchExport}
          >
            📤 批量导出
          </button>

          {showBatchPinPriority && (
            <div className="modal-overlay" onClick={() => setShowBatchPinPriority(false)}>
              <div className="modal-content small-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>设置置顶优先级</h3>
                  <button className="btn-close" onClick={() => setShowBatchPinPriority(false)}>
                    &times;
                  </button>
                </div>
                <div className="modal-body">
                  <p className="pin-priority-desc">数值越大越靠前</p>
                  <div className="pin-priority-input-wrapper">
                    <input
                      type="number"
                      className="pin-priority-input"
                      value={batchPinPriority}
                      onChange={(e) => setBatchPinPriority(Math.max(0, parseInt(e.target.value) || 0))}
                      min="0"
                      max="999"
                      autoFocus
                    />
                  </div>
                  <div className="pin-priority-presets">
                    {[0, 1, 2, 3, 5, 10].map(p => (
                      <button
                        key={p}
                        className={`pin-priority-preset ${batchPinPriority === p ? 'active' : ''}`}
                        onClick={() => setBatchPinPriority(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowBatchPinPriority(false)}
                  >
                    取消
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleBatchPin(true, batchPinPriority)}
                  >
                    确定置顶
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <h3>
            {searchKeyword || selectedTagId
              ? '没有找到匹配的笔记'
              : viewMode === 'favorites'
                ? '还没有收藏的笔记'
                : viewMode === 'pinned'
                  ? '还没有置顶的笔记'
                  : '还没有笔记'}
          </h3>
          <p>
            {searchKeyword || selectedTagId
              ? '试试其他关键词，或者创建一条新笔记'
              : viewMode === 'favorites'
                ? '点击笔记卡片上的 ⭐ 按钮收藏笔记'
                : viewMode === 'pinned'
                  ? '点击笔记卡片上的 📍 按钮置顶笔记'
                  : '点击上方按钮创建你的第一条笔记'}
          </p>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              searchKeyword={searchKeyword}
              onEdit={handleEditNote}
              onDelete={handleDeleteNote}
              onRemoveTag={handleRemoveTag}
              onTagClick={handleTagClick}
              onFavoriteToggle={handleFavoriteToggle}
              onPinToggle={handlePinToggle}
              onExportSuccess={handleExportSuccess}
              onExportError={handleExportError}
              selectable={selectMode}
              selected={selectedNoteIds.includes(note.id)}
              onSelect={handleSelectNote}
              viewMode={viewMode}
            />
          ))}
        </div>
      )}

      <NoteModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitNote}
        note={editingNote}
        error={modalError}
        onTagsChange={handleNoteModalTagsChange}
      />

      <TagManager
        isOpen={isTagManagerOpen}
        onClose={handleTagManagerClose}
        onTagsChange={handleTagsChange}
      />

      {showBatchExportModal && (
        <div className="modal-overlay" onClick={() => !batchExporting && setShowBatchExportModal(false)}>
          <div className="modal-content small-modal" ref={batchExportModalRef} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📤 批量导出笔记</h3>
              <button
                className="btn-close"
                onClick={() => !batchExporting && setShowBatchExportModal(false)}
                disabled={batchExporting}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="export-menu-section">
                <div className="export-menu-label">导出范围</div>
                <div className="export-format-options">
                  <label className={`export-format-option ${!exportAll ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      value="selected"
                      checked={!exportAll}
                      onChange={() => setExportAll(false)}
                      disabled={selectedNoteIds.length === 0}
                    />
                    <span>已选择的笔记 ({selectedNoteIds.length} 条)</span>
                  </label>
                  <label className={`export-format-option ${exportAll ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      value="all"
                      checked={exportAll}
                      onChange={() => setExportAll(true)}
                    />
                    <span>全部笔记 ({allNotes.length} 条)</span>
                  </label>
                </div>
              </div>

              <div className="export-menu-section">
                <div className="export-menu-label">导出格式</div>
                <div className="export-format-options">
                  <label className={`export-format-option ${batchExportFormat === 'md' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="batchExportFormat"
                      value="md"
                      checked={batchExportFormat === 'md'}
                      onChange={(e) => setBatchExportFormat(e.target.value)}
                    />
                    <span>Markdown (.md)</span>
                  </label>
                  <label className={`export-format-option ${batchExportFormat === 'txt' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="batchExportFormat"
                      value="txt"
                      checked={batchExportFormat === 'txt'}
                      onChange={(e) => setBatchExportFormat(e.target.value)}
                    />
                    <span>纯文本 (.txt)</span>
                  </label>
                </div>
              </div>

              <div className="export-menu-section">
                <label className="export-checkbox-option">
                  <input
                    type="checkbox"
                    checked={batchExportIncludeTags}
                    onChange={(e) => setBatchExportIncludeTags(e.target.checked)}
                  />
                  <span>包含标签</span>
                </label>
                <label className="export-checkbox-option">
                  <input
                    type="checkbox"
                    checked={batchExportIncludeMetadata}
                    onChange={(e) => setBatchExportIncludeMetadata(e.target.checked)}
                  />
                  <span>包含元数据（创建时间、收藏状态等）</span>
                </label>
              </div>

              {batchExporting && (
                <div className="export-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${batchExportProgress}%` }}
                    />
                  </div>
                  <p className="export-progress-text">
                    导出中... {batchExportProgress}%
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowBatchExportModal(false)}
                disabled={batchExporting}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleBatchExport}
                disabled={batchExporting || (!exportAll && selectedNoteIds.length === 0)}
              >
                {batchExporting ? '导出中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
