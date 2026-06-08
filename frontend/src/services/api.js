import axios from 'axios'

const API_BASE_URL = '/api'

export const parseBlobError = async (error) => {
  try {
    const respData = error?.response?.data
    if (respData instanceof Blob) {
      try {
        const text = await respData.text()
        if (text) {
          try {
            const data = JSON.parse(text)
            if (data?.detail) return data.detail
            if (data?.message) return data.message
            if (typeof data === 'string') return data
          } catch {
            return text || '导出失败，请稍后重试'
          }
        }
      } catch {
        return '导出失败，请稍后重试'
      }
    }
    if (respData?.detail) return respData.detail
    if (respData?.message) return respData.message
    if (error?.message) return error.message
  } catch {
    return '导出失败，请稍后重试'
  }
  return '导出失败，请稍后重试'
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config.url
      if (url !== '/auth/login') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (userData) => {
    return api.post('/auth/register', userData)
  },

  login: (credentials) => {
    return api.post('/auth/login', credentials)
  },

  logout: () => {
    return api.post('/auth/logout')
  },

  getCurrentUser: () => {
    return api.get('/auth/me')
  },
}

export const noteApi = {
  getNotes: (search = '', tagId = null, onlyFavorites = false, onlyPinned = false) => {
    const params = {}
    if (search) params.search = search
    if (tagId) params.tag_id = tagId
    if (onlyFavorites) params.only_favorites = true
    if (onlyPinned) params.only_pinned = true
    return api.get('/notes', { params })
  },

  getFavoriteNotes: (search = '', tagId = null) => {
    const params = {}
    if (search) params.search = search
    if (tagId) params.tag_id = tagId
    return api.get('/notes/favorites', { params })
  },

  getPinnedNotes: (search = '', tagId = null) => {
    const params = {}
    if (search) params.search = search
    if (tagId) params.tag_id = tagId
    return api.get('/notes/pinned', { params })
  },

  getNote: (id) => {
    return api.get(`/notes/${id}`)
  },

  createNote: (note) => {
    return api.post('/notes', note)
  },

  updateNote: (id, note) => {
    return api.put(`/notes/${id}`, note)
  },

  deleteNote: (id) => {
    return api.delete(`/notes/${id}`)
  },

  toggleFavorite: (noteId) => {
    return api.put(`/notes/${noteId}/favorite`)
  },

  togglePin: (noteId, pinPriority = 0) => {
    return api.put(`/notes/${noteId}/pin`, null, { params: { pin_priority: pinPriority } })
  },

  batchSetFavorite: (noteIds, isFavorited) => {
    return api.put('/notes/batch/favorite', { note_ids: noteIds, is_favorited: isFavorited })
  },

  batchSetPin: (noteIds, isPinned, pinPriority = 0) => {
    return api.put('/notes/batch/pin', { note_ids: noteIds, is_pinned: isPinned, pin_priority: pinPriority })
  },

  unpinAll: () => {
    return api.put('/notes/unpin-all')
  },

  batchUnfavorite: (noteIds) => {
    return api.put('/notes/batch/unfavorite', { note_ids: noteIds, is_favorited: false })
  },

  addTags: (noteId, tagIds) => {
    return api.post(`/notes/${noteId}/tags`, { tag_ids: tagIds })
  },

  updateTags: (noteId, tagIds) => {
    return api.put(`/notes/${noteId}/tags`, { tag_ids: tagIds })
  },

  removeTag: (noteId, tagId) => {
    return api.delete(`/notes/${noteId}/tags/${tagId}`)
  },

  exportNotes: (noteIds, format, includeTags = true, includeMetadata = true) => {
    return api.post('/notes/export', {
      note_ids: noteIds,
      format,
      include_tags: includeTags,
      include_metadata: includeMetadata
    })
  },

  exportSingleNote: (noteId, format, includeTags = true, includeMetadata = true) => {
    return api.get(`/notes/${noteId}/export/${format}`, {
      params: {
        include_tags: includeTags,
        include_metadata: includeMetadata
      },
      responseType: 'blob'
    })
  },

  downloadExport: (userId, filename) => {
    return api.get(`/exports/download/${userId}/${filename}`, {
      responseType: 'blob'
    })
  },

  enableShare: (noteId, password = null, expiresDays = null) => {
    return api.post(`/notes/${noteId}/share`, {
      password,
      expires_days: expiresDays
    })
  },

  disableShare: (noteId) => {
    return api.delete(`/notes/${noteId}/share`)
  },

  getShareInfo: (noteId) => {
    return api.get(`/notes/${noteId}/share`)
  },

  getShareStats: (noteId) => {
    return api.get(`/notes/${noteId}/share/stats`)
  },

  getShareQrcode: (noteId) => {
    return api.get(`/notes/${noteId}/share/qrcode`, {
      responseType: 'blob'
    })
  },

  getTrashNotes: (search = '', deletedFrom = null, deletedTo = null) => {
    const params = {}
    if (search) params.search = search
    if (deletedFrom) params.deleted_from = deletedFrom
    if (deletedTo) params.deleted_to = deletedTo
    return api.get('/notes/trash', { params })
  },

  getTrashCount: () => {
    return api.get('/notes/trash/count')
  },

  restoreNote: (noteId) => {
    return api.put(`/notes/${noteId}/restore`)
  },

  batchRestoreNotes: (noteIds) => {
    return api.put('/notes/batch/restore', { note_ids: noteIds })
  },

  permanentDeleteNote: (noteId) => {
    return api.delete(`/notes/${noteId}/permanent`)
  },

  batchPermanentDeleteNotes: (noteIds) => {
    return api.post('/notes/batch/permanent-delete', { note_ids: noteIds })
  },
}

export const publicApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const publicShareApi = {
  getPublicNote: (token) => {
    return publicApi.get(`/public/share/${token}`)
  },

  accessProtectedNote: (token, password) => {
    return publicApi.post(`/public/share/${token}/access`, { password })
  },
}

export const tagApi = {
  getTags: () => {
    return api.get('/tags')
  },

  createTag: (tag) => {
    return api.post('/tags', tag)
  },

  updateTag: (id, tag) => {
    return api.put(`/tags/${id}`, tag)
  },

  deleteTag: (id) => {
    return api.delete(`/tags/${id}`)
  },
}

export const fileApi = {
  getFiles: (search = '', fileType = '') => {
    const params = {}
    if (search) params.search = search
    if (fileType) params.file_type = fileType
    return api.get('/files', { params })
  },

  getFile: (id) => {
    return api.get(`/files/${id}`)
  },

  uploadFiles: (files, onUploadProgress) => {
    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file)
    })
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    })
  },

  downloadFile: (id) => {
    return api.get(`/files/${id}/download`, {
      responseType: 'blob',
    })
  },

  getImageBlob: (id) => {
    return api.get(`/files/${id}/image-blob`, {
      responseType: 'blob',
    })
  },

  previewDocument: (id, maxRows = 100) => {
    return api.get(`/files/${id}/preview-document`, {
      params: { max_rows: maxRows }
    })
  },

  previewFile: (id) => {
    return `${api.defaults.baseURL}/files/${id}/preview`
  },

  deleteFile: (id) => {
    return api.delete(`/files/${id}`)
  },

  batchDeleteFiles: (fileIds) => {
    return api.post('/files/batch-delete', { file_ids: fileIds })
  },
}

export default api
