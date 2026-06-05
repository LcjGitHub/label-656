import { useState, useEffect } from 'react'
import NoteCard from './components/NoteCard.jsx'
import NoteModal from './components/NoteModal.jsx'
import { noteApi } from './services/api.js'

function App() {
  const [notes, setNotes] = useState([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchNotes = async (search = '') => {
    try {
      setLoading(true)
      setError('')
      const response = await noteApi.getNotes(search)
      setNotes(response.data)
    } catch (err) {
      setError('加载笔记失败，请稍后重试')
      console.error('Error fetching notes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes(searchKeyword)
  }, [searchKeyword])

  const handleSearch = (e) => {
    setSearchKeyword(e.target.value)
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
      setNotes(notes.filter(note => note.id !== id))
    } catch (err) {
      setError('删除笔记失败，请稍后重试')
      console.error('Error deleting note:', err)
    }
  }

  const handleSubmitNote = async (noteData) => {
    try {
      setError('')
      if (editingNote) {
        const response = await noteApi.updateNote(editingNote.id, noteData)
        setNotes(notes.map(note =>
          note.id === editingNote.id ? response.data : note
        ))
      } else {
        const response = await noteApi.createNote(noteData)
        setNotes([response.data, ...notes])
      }
      setIsModalOpen(false)
      setEditingNote(null)
    } catch (err) {
      setError('保存笔记失败，请稍后重试')
      console.error('Error saving note:', err)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingNote(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>📝 笔记管理</h1>
        <p>记录你的想法，随时查看和编辑</p>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索笔记..."
          value={searchKeyword}
          onChange={handleSearch}
        />
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
            {searchKeyword ? '没有找到匹配的笔记' : '还没有笔记'}
          </h3>
          <p>
            {searchKeyword
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
            />
          ))}
        </div>
      )}

      <NoteModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitNote}
        note={editingNote}
      />
    </div>
  )
}

export default App
