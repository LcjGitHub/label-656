import axios from 'axios'

const API_BASE_URL = '/api'

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
  getNotes: (search = '') => {
    const params = search ? { search } : {}
    return api.get('/notes', { params })
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
