import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      token: null,
      user: null,
      isLoading: false,
      error: null,

      // Actions
      login: async (code) => {
        set({ isLoading: true, error: null })
        console.log('[AuthStore] Login started with code:', code.substring(0, 4) + '****')
        try {
          const response = await api.post('/auth/login', { code })
          console.log('[AuthStore] Login API response:', response.data)
          const { token, user } = response.data.data
          
          // Set default auth header
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          console.log('[AuthStore] Token saved, length:', token.length)
          
          set({ 
            token, 
            user,
            isLoading: false,
            error: null 
          })
          
          return { success: true }
        } catch (error) {
          console.error('[AuthStore] Login error:', error.response?.data || error.message)
          set({ 
            isLoading: false, 
            error: error.response?.data?.message || 'Giriş başarısız'
          })
          return { success: false, error: error.response?.data?.message }
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout')
        } catch (error) {
          // Ignore logout errors
        }
        
        // Clear auth header
        delete api.defaults.headers.common['Authorization']
        
        set({ 
          token: null, 
          user: null, 
          error: null 
        })
      },

      fetchUser: async () => {
        const token = get().token
        if (!token) return

        try {
          const response = await api.get('/auth/me')
          set({ user: response.data.data })
        } catch (error) {
          // Token might be expired
          if (error.response?.status === 401) {
            get().logout()
          }
        }
      },

      clearError: () => set({ error: null }),

      // Sync token to API headers (call this before making authenticated requests)
      syncToken: (externalToken) => {
        const token = externalToken || get().token
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          return true
        }
        return false
      },

      // Restore auth state from storage (used on page refresh)
      restoreAuth: (token, user) => {
        set({ token, user })
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      },

      // Get authentication status (getter, not function)
      get isAuthenticated() {
        return !!get().token
      }
    }),
    {
      name: 'iptv-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Storage'dan veri yüklendikten sonra API header'ı güncelle
        if (state?.token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`
        }
      }
    }
  )
)
