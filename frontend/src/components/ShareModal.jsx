import { useState, useEffect, useRef } from 'react'
import { noteApi } from '../services/api.js'

const ShareModal = ({ isOpen, onClose, noteId, noteTitle }) => {
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareToken, setShareToken] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [expiresDays, setExpiresDays] = useState('')
  const [expiresAt, setExpiresAt] = useState(null)
  const [viewCount, setViewCount] = useState(0)
  const [shareCreatedAt, setShareCreatedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [qrcodeUrl, setQrcodeUrl] = useState('')
  const [showQrcode, setShowQrcode] = useState(false)
  const [stats, setStats] = useState(null)
  const [copied, setCopied] = useState(false)
  const qrcodeRef = useRef(null)

  useEffect(() => {
    if (isOpen && noteId) {
      fetchShareInfo()
    }
  }, [isOpen, noteId])

  const fetchShareInfo = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await noteApi.getShareInfo(noteId)
      const data = response.data
      setShareEnabled(data.is_shared === 1)
      setShareUrl(data.share_url || '')
      setShareToken(data.share_token || '')
      setHasPassword(!!data.share_password)
      setPassword('')
      setExpiresAt(data.share_expires_at)
      setViewCount(data.share_view_count || 0)
      setShareCreatedAt(data.share_created_at)
      if (data.is_shared === 1) {
        fetchStats()
      }
    } catch (err) {
      console.error('Error fetching share info:', err)
      setError('获取分享信息失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await noteApi.getShareStats(noteId)
      setStats(response.data)
      setViewCount(response.data.view_count || 0)
    } catch (err) {
      console.error('Error fetching share stats:', err)
    }
  }

  const fetchQrcode = async () => {
    try {
      const response = await noteApi.getShareQrcode(noteId)
      const url = URL.createObjectURL(response.data)
      setQrcodeUrl(url)
      setShowQrcode(true)
    } catch (err) {
      console.error('Error fetching qrcode:', err)
      setError('获取二维码失败')
    }
  }

  const handleEnableShare = async () => {
    try {
      setLoading(true)
      setError('')
      const pwd = password.trim()
      if (pwd && pwd.length < 4) {
        setError('分享密码长度不能少于4位')
        setLoading(false)
        return
      }
      const days = expiresDays ? parseInt(expiresDays) : null
      const response = await noteApi.enableShare(noteId, pwd || null, days)
      const data = response.data
      setShareEnabled(true)
      setShareUrl(data.share_url)
      setShareToken(data.share_token)
      setHasPassword(!!data.share_password)
      setPassword('')
      setExpiresAt(data.share_expires_at)
      setShareCreatedAt(data.share_created_at)
      setViewCount(data.share_view_count || 0)
      fetchStats()
    } catch (err) {
      console.error('Error enabling share:', err)
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail)
      } else {
        setError('开启分享失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDisableShare = async () => {
    if (!window.confirm('确定要关闭分享吗？关闭后分享链接将失效。')) return
    try {
      setLoading(true)
      setError('')
      await noteApi.disableShare(noteId)
      setShareEnabled(false)
      setShareUrl('')
      setShareToken('')
      setHasPassword(false)
      setPassword('')
      setExpiresDays('')
      setExpiresAt(null)
      setViewCount(0)
      setShareCreatedAt(null)
      setStats(null)
      setQrcodeUrl('')
      setShowQrcode(false)
    } catch (err) {
      console.error('Error disabling share:', err)
      setError('关闭分享失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      const fullUrl = window.location.origin + shareUrl
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Error copying:', err)
      const fullUrl = window.location.origin + shareUrl
      const textarea = document.createElement('textarea')
      textarea.value = fullUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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

  const handleClose = () => {
    if (qrcodeUrl) {
      URL.revokeObjectURL(qrcodeUrl)
    }
    setQrcodeUrl('')
    setShowQrcode(false)
    onClose && onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔗 分享笔记</h3>
          <button className="btn-close" onClick={handleClose} disabled={loading}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="share-note-title">
            📝 {noteTitle || '无标题笔记'}
          </div>

          {error && <div className="share-error">{error}</div>}

          {!shareEnabled ? (
            <div className="share-config-section">
              <div className="share-desc">
                开启公开分享后，任何人都可以通过链接访问此笔记。
              </div>

              <div className="form-group">
                <label>访问密码（可选）</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="留空则无需密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={50}
                />
                <div className="label-hint">设置后访问者需要输入密码才能查看</div>
              </div>

              <div className="form-group">
                <label>有效期（可选）</label>
                <select
                  className="form-input"
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                >
                  <option value="">永久有效</option>
                  <option value="1">1 天</option>
                  <option value="7">7 天</option>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                </select>
              </div>

              <button
                className="btn btn-primary btn-block"
                onClick={handleEnableShare}
                disabled={loading}
              >
                {loading ? '处理中...' : '🚀 开启分享'}
              </button>
            </div>
          ) : (
            <div className="share-enabled-section">
              <div className="share-status-badge active">
                ✅ 分享已开启
              </div>

              <div className="share-url-section">
                <label>分享链接</label>
                <div className="share-url-row">
                  <input
                    type="text"
                    className="form-input share-url-input"
                    value={window.location.origin + shareUrl}
                    readOnly
                  />
                  <button
                    className={`btn ${copied ? 'btn-success' : 'btn-secondary'} btn-small`}
                    onClick={handleCopyLink}
                  >
                    {copied ? '✓ 已复制' : '复制链接'}
                  </button>
                </div>
              </div>

              <div className="share-info-grid">
                <div className="share-info-item">
                  <span className="share-info-label">访问密码：</span>
                  <span className="share-info-value">
                    {hasPassword ? '🔒 已设置' : '🔓 无密码'}
                  </span>
                </div>
                <div className="share-info-item">
                  <span className="share-info-label">有效期：</span>
                  <span className="share-info-value">
                    {expiresAt ? formatDate(expiresAt) + ' 过期' : '永久有效'}
                  </span>
                </div>
                <div className="share-info-item">
                  <span className="share-info-label">创建时间：</span>
                  <span className="share-info-value">{formatDate(shareCreatedAt)}</span>
                </div>
                <div className="share-info-item">
                  <span className="share-info-label">访问次数：</span>
                  <span className="share-info-value highlight">{viewCount} 次</span>
                </div>
              </div>

              <div className="share-actions-row">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={fetchQrcode}
                  disabled={loading}
                >
                  📱 {showQrcode ? '刷新二维码' : '生成二维码'}
                </button>
                <button
                  className="btn btn-danger btn-small"
                  onClick={handleDisableShare}
                  disabled={loading}
                >
                  ❌ 关闭分享
                </button>
              </div>

              {showQrcode && qrcodeUrl && (
                <div className="qrcode-section" ref={qrcodeRef}>
                  <div className="qrcode-title">扫码访问</div>
                  <img src={qrcodeUrl} alt="分享二维码" className="qrcode-img" />
                  <div className="qrcode-hint">使用手机扫描二维码即可访问</div>
                </div>
              )}

              {stats && stats.recent_views && stats.recent_views.length > 0 && (
                <div className="share-stats-section">
                  <div className="share-stats-title">📊 最近访问记录</div>
                  <div className="share-views-list">
                    {stats.recent_views.slice(0, 5).map((view, idx) => (
                      <div key={idx} className="share-view-item">
                        <span className="share-view-time">{formatDate(view.viewed_at)}</span>
                        <span className="share-view-ip">{view.ip_address || '未知 IP'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="share-update-section">
                <div className="share-update-title">更新分享设置</div>

                <div className="form-group">
                  <label>新访问密码（留空保持不变）</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder={hasPassword ? '留空保持当前密码' : '设置访问密码'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={50}
                  />
                </div>

                <div className="form-group">
                  <label>有效期</label>
                  <select
                    className="form-input"
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(e.target.value)}
                  >
                    <option value="">永久有效</option>
                    <option value="1">1 天</option>
                    <option value="7">7 天</option>
                    <option value="30">30 天</option>
                    <option value="90">90 天</option>
                  </select>
                </div>

                <button
                  className="btn btn-secondary btn-small"
                  onClick={handleEnableShare}
                  disabled={loading}
                >
                  {loading ? '更新中...' : '💾 更新设置'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ShareModal
