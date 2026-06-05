import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../services/api.js'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const initAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    const storedUser = localStorage.getItem('user')

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser))
        setIsAuthenticated(true)
      } catch (err) {
        console.error('Failed to parse stored user:', err)
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    initAuth()
  }, [initAuth])

  const login = async (username, password) => {
    try {
      const response = await authApi.login({ username, password })
      const { access_token } = response.data

      localStorage.setItem('access_token', access_token)

      const userResponse = await authApi.getCurrentUser()
      const userData = userResponse.data

      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
      setIsAuthenticated(true)

      return { success: true }
    } catch (err) {
      let errorMessage = '登录失败，请稍后重试'
      if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = err.response.data.detail
      }
      return { success: false, error: errorMessage }
    }
  }

  const register = async (userData) => {
    try {
      const response = await authApi.register(userData)
      return { success: true, user: response.data }
    } catch (err) {
      let errorMessage = '注册失败，请稍后重试'
      if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = err.response.data.detail
      } else if (err.response && err.response.data && Array.isArray(err.response.data.detail)) {
        const errors = err.response.data.detail.map(e => e.msg)
        errorMessage = errors.join(', ')
      }
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch (err) {
      console.error('Logout API error:', err)
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      setUser(null)
      setIsAuthenticated(false)
    }
  }

  const checkAuth = useCallback(() => {
    const token = localStorage.getItem('access_token')
    return !!token
  }, [])

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    checkAuth,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
