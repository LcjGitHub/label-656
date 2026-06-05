const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const NoteCard = ({ note, searchKeyword, onEdit, onDelete }) => {
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

  return (
    <div className="note-card">
      <div className="note-header">
        <h3 className="note-title">
          {highlightText(note.title, searchKeyword)}
        </h3>
        <div className="note-actions">
          <button className="btn btn-edit" onClick={() => onEdit(note)}>
            编辑
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(note.id)}>
            删除
          </button>
        </div>
      </div>
      <p className="note-content">
        {highlightText(note.content, searchKeyword)}
      </p>
      <div className="note-meta">
        <span>创建: {formatDate(note.created_at)}</span>
        {note.updated_at && (
          <span>更新: {formatDate(note.updated_at)}</span>
        )}
      </div>
    </div>
  )
}

export default NoteCard
