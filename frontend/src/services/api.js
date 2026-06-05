import axios from 'axios'

const API_BASE_URL = '/api'

export const noteApi = {
  getNotes: (search = '') => {
    const params = search ? { search } : {}
    return axios.get(`${API_BASE_URL}/notes`, { params })
  },

  getNote: (id) => {
    return axios.get(`${API_BASE_URL}/notes/${id}`)
  },

  createNote: (note) => {
    return axios.post(`${API_BASE_URL}/notes`, note)
  },

  updateNote: (id, note) => {
    return axios.put(`${API_BASE_URL}/notes/${id}`, note)
  },

  deleteNote: (id) => {
    return axios.delete(`${API_BASE_URL}/notes/${id}`)
  }
}
