import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { publicShareApi } from '../services/api.js'

const getContrastColor = (hexColor) => {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}

const SharePage = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [note, setNote] = useState(null)
  const [requiresPassword, setRequiresPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchNote()
  }, [token])

  const fetchNote = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await publicShareApi.getPublicNote(token)
      const data = response.data
      if (data.requires_password) {
        setRequiresPassword(true)
      } else {
        setNote(data)
      }
    } catch (err) {
      console.error('Error fetching shared note:', err)
      if (err.response) {
        if (err.response.status === 404) {
          setError('分享链接不存在或已关闭')
        } else if (err.response.status === 410) {
          setError('该分享链接已过期')
        } else if (err.response.data && err.response.data.detail) {
          setError(err.response.data.detail)
        } else {
          setError('加载笔记失败')
        }
      } else {
        setError('网络错误，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitPassword = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      setPasswordError('请输入访问密码')
      return
    }
    try {
      setSubmitting(true)
      setPasswordError('')
      const response = await publicShareApi.accessProtectedNote(token, password.trim())
      setNote(response.data)
      setRequiresPassword(false)
    } catch (err) {
      console.error('Error accessing protected note:', err)
      if (err.response && err.response.status === 401) {
        setPasswordError('密码错误，请重试')
      } else if (err.response && err.response.data && err.response.data.detail) {
        setPasswordError(err.response.data.detail)
      } else {
        setPasswordError('验证失败，请稍后重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleBackToApp = () => {
    navigate('/')
  }

  return (
    <div className="share-page">
      <header className="share-header">
        <div className="share-header-content">
          <h1 className="share-logo">📝 笔记分享</h1>
          <button className="btn btn-secondary btn-small" onClick={handleBackToApp}>
            返回笔记
          </button>
        </div>
      </header>

      <div className="share-container">
        {loading ? (
          <div className="share-loading">
            <div className="loading-spinner" />
            <p>加载中...</p>
          </div>
        ) : error ? (
          <div className="share-error-state">
            <div className="share-error-icon">⚠️</div>
            <h2>无法访问此笔记</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={handleBackToApp}>
              返回首页
            </button>
          </div>
        ) : requiresPassword ? (
          <div className="share-password-box">
            <div className="share-password-icon">🔒</div>
            <h2>该笔记已加密</h2>
            <p>请输入访问密码以查看笔记内容</p>
            <form onSubmit={handleSubmitPassword}>
              <div className="form-group">
                <input
                  type="password"
                  className="form-input"
                  placeholder="请输入访问密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {passwordError && <div className="share-password-error">{passwordError}</div>}
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={submitting}
              >
                {submitting ? '验证中...' : '解锁查看'}
              </button>
            </form>
          </div>
        ) : note ? (
          <div className="share-note-view">
            <div className="share-source-info">
              <div className="share-avatar">
                {(note.owner_name || note.owner_username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="share-source-detail">
                <div className="share-source-name">
                  {note.owner_name || note.owner_username || '匿名用户'}
                </div>
                <div className="share-source-label">分享的笔记</div>
              </div>
            </div>

            <div className="share-note-card">
              <h1 className="share-note-title">
                {note.title && note.title.trim() ? note.title : '无标题笔记'}
              </h1>

              {note.tags && note.tags.length > 0 && (
                <div className="share-note-tags">
                  {note.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="tag-badge"
                      style={{
                        backgroundColor: tag.color,
                        color: getContrastColor(tag.color),
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="share-note-content note-content-rich"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />

              <div className="share-note-meta">
                <span>📅 创建时间: {formatDate(note.created_at)}</span>
                {note.updated_at && (
                  <span>✏️ 更新时间: {formatDate(note.updated_at)}</span>
                )}
              </div>
            </div>

            <div className="share-footer">
              <p>本文通过公开分享链接访问</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default SharePage
