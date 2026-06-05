import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import NoteCard from './components/NoteCard.jsx'
import NoteModal from './components/NoteModal.jsx'
import TagManager from './components/TagManager.jsx'
import { noteApi, tagApi } from './services/api.js'
import { useAuth } from './context/AuthContext.jsx'

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

  const fetchAllNotes = async () => {
    try {
      setAllNotesLoading(true)
      const response = await noteApi.getNotes('', null)
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
      const response = await noteApi.getNotes(search, tagId)
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
  }, [searchKeyword, selectedTagId])

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
        <button className="btn btn-secondary" onClick={() => setIsTagManagerOpen(true)}>
          🏷️ 管理标签
        </button>
        <button className="btn btn-primary" onClick={handleCreateNote}>
          + 新建笔记
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <p>加载中...</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <h3>
            {searchKeyword || selectedTagId ? '没有找到匹配的笔记' : '还没有笔记'}
          </h3>
          <p>
            {searchKeyword || selectedTagId
              ? '试试其他关键词，或者创建一条新笔记'
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
    </div>
  )
}

export default App
