import { useState, useEffect } from 'react'
import { commentApi } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'

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

const CommentItem = ({ comment, currentUser, noteOwnerId, onLikeToggle, onEdit, onDelete, onReply }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [isLiking, setIsLiking] = useState(false)

  const canEdit = currentUser && comment.user_id === currentUser.id
  const canDelete = currentUser && (comment.user_id === currentUser.id || noteOwnerId === currentUser.id)
  const commenterName = comment.user?.full_name || comment.user?.username || '匿名用户'

  const handleLike = async () => {
    if (isLiking) return
    setIsLiking(true)
    try {
      await onLikeToggle(comment.id)
    } finally {
      setIsLiking(false)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    const content = editContent.trim()
    if (!content || content === comment.content) {
      setIsEditing(false)
      return
    }
    try {
      await onEdit(comment.id, content)
      setIsEditing(false)
    } catch (err) {
      console.error('Error editing comment:', err)
      alert(err.response?.data?.detail || '编辑评论失败')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('确定要删除这条评论吗？')) return
    try {
      await onDelete(comment.id)
    } catch (err) {
      console.error('Error deleting comment:', err)
      alert(err.response?.data?.detail || '删除评论失败')
    }
  }

  const handleReplySubmit = async (e) => {
    e.preventDefault()
    const content = replyContent.trim()
    if (!content) return
    try {
      await onReply(comment.id, content)
      setReplyContent('')
      setShowReplyForm(false)
    } catch (err) {
      console.error('Error replying comment:', err)
      alert(err.response?.data?.detail || '回复评论失败')
    }
  }

  return (
    <div className="comment-item">
      <div className="comment-header">
        <div className="comment-user-info">
          <div className="comment-avatar">
            {commenterName.charAt(0).toUpperCase()}
          </div>
          <div className="comment-user-details">
            <span className="comment-username">{commenterName}</span>
            <span className="comment-time">{formatDate(comment.created_at)}</span>
            {comment.updated_at && comment.updated_at !== comment.created_at && (
              <span className="comment-edited">(已编辑)</span>
            )}
          </div>
        </div>
        {(canEdit || canDelete) && (
          <div className="comment-actions">
            {canEdit && (
              <button
                className="comment-action-btn"
                onClick={() => setIsEditing(!isEditing)}
                title="编辑"
              >
                ✏️
              </button>
            )}
            {canDelete && (
              <button
                className="comment-action-btn delete"
                onClick={handleDelete}
                title="删除"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleEditSubmit} className="comment-edit-form">
          <textarea
            className="comment-edit-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={1000}
            autoFocus
          />
          <div className="comment-edit-actions">
            <span className="comment-char-count">{editContent.length}/1000</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setIsEditing(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary btn-small">
              保存
            </button>
          </div>
        </form>
      ) : (
        <div className="comment-content">{comment.content}</div>
      )}

      <div className="comment-footer">
        <button
          className={`comment-like-btn ${comment.is_liked_by_me ? 'liked' : ''}`}
          onClick={handleLike}
          disabled={isLiking}
        >
          {comment.is_liked_by_me ? '❤️' : '🤍'} {comment.like_count}
        </button>
        <button
          className="comment-reply-btn"
          onClick={() => setShowReplyForm(!showReplyForm)}
        >
          💬 回复
        </button>
      </div>

      {showReplyForm && (
        <form onSubmit={handleReplySubmit} className="comment-reply-form">
          <textarea
            className="comment-reply-textarea"
            placeholder={`回复 ${commenterName}...`}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            maxLength={1000}
            autoFocus
          />
          <div className="comment-reply-actions">
            <span className="comment-char-count">{replyContent.length}/1000</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowReplyForm(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary btn-small" disabled={!replyContent.trim()}>
              回复
            </button>
          </div>
        </form>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              noteOwnerId={noteOwnerId}
              onLikeToggle={onLikeToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const CommentsSection = ({ noteId, noteOwnerId, onCommentsChange }) => {
  const [comments, setComments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuth()

  const fetchComments = async () => {
    try {
      setLoading(true)
      const response = await commentApi.getComments(noteId)
      setComments(response.data.comments)
      setTotalCount(response.data.total)
      if (onCommentsChange) {
        onCommentsChange(response.data.total)
      }
    } catch (err) {
      console.error('Error fetching comments:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (noteId) {
      fetchComments()
    }
  }, [noteId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const content = newComment.trim()
    if (!content || submitting) return
    setSubmitting(true)
    try {
      await commentApi.createComment(noteId, content)
      setNewComment('')
      await fetchComments()
    } catch (err) {
      console.error('Error creating comment:', err)
      alert(err.response?.data?.detail || '发表评论失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLikeToggle = async (commentId) => {
    const response = await commentApi.toggleLike(commentId)
    const { liked, like_count } = response.data
    setComments(prevComments => {
      const updateLike = (list) => {
        return list.map(c => {
          if (c.id === commentId) {
            return { ...c, is_liked_by_me: liked, like_count }
          }
          if (c.replies && c.replies.length > 0) {
            return { ...c, replies: updateLike(c.replies) }
          }
          return c
        })
      }
      return updateLike(prevComments)
    })
  }

  const handleEdit = async (commentId, content) => {
    const response = await commentApi.updateComment(commentId, content)
    const updatedComment = response.data
    setComments(prevComments => {
      const updateComment = (list) => {
        return list.map(c => {
          if (c.id === commentId) {
            return { ...c, content: updatedComment.content, updated_at: updatedComment.updated_at }
          }
          if (c.replies && c.replies.length > 0) {
            return { ...c, replies: updateComment(c.replies) }
          }
          return c
        })
      }
      return updateComment(prevComments)
    })
  }

  const handleDelete = async (commentId) => {
    await commentApi.deleteComment(commentId)
    await fetchComments()
  }

  const handleReply = async (parentId, content) => {
    await commentApi.createComment(noteId, content, parentId)
    await fetchComments()
  }

  return (
    <div className="comments-section">
      <div className="comments-header">
        <h3>💬 评论区</h3>
        <span className="comments-count">共 {totalCount} 条评论</span>
      </div>

      <form onSubmit={handleSubmit} className="comment-form">
        <textarea
          className="comment-textarea"
          placeholder="发表你的评论..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          maxLength={1000}
        />
        <div className="comment-form-actions">
          <span className="comment-char-count">{newComment.length}/1000</span>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newComment.trim() || submitting}
          >
            {submitting ? '发表中...' : '发表评论'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="comments-loading">加载评论中...</div>
      ) : comments.length === 0 ? (
        <div className="comments-empty">
          <p>还没有评论，快来发表第一条评论吧！</p>
        </div>
      ) : (
        <div className="comments-list">
          {comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={user}
              noteOwnerId={noteOwnerId}
              onLikeToggle={handleLikeToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReply={handleReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default CommentsSection
