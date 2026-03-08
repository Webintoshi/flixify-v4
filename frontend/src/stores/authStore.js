import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,
      hasHydrated: false,

      login: async (code) => {
        set({ isLoading: true, error: null })

        try {
          const response = await api.post('/auth/login', { code })
          const { token, user } = response.data.data

          api.defaults.headers.common.Authorization = `Bearer ${token}`

          set({
            token,
            user,
            hasHydrated: true,
            isLoading: false,
            error: null
          })

          return { success: true }
        } catch (error) {
          const message = error.response?.data?.message || 'Giris basarisiz'

          set({
            isLoading: false,
            error: message
          })

          return { success: false, error: message }
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout')
        } catch {
          // ignore logout errors
        }

        delete api.defaults.headers.common.Authorization

        set({
          token: null,
          user: null,
          hasHydrated: true,
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
          if (error.response?.status === 401) {
            get().logout()
          }
        }
      },

      clearError: () => set({ error: null }),

      syncToken: (externalToken) => {
        const token = externalToken || get().token
        if (!token) return false

        api.defaults.headers.common.Authorization = `Bearer ${token}`
        return true
      },

      restoreAuth: (token, user) => {
        if (!token) return

        api.defaults.headers.common.Authorization = `Bearer ${token}`
        set({ token, user, hasHydrated: true })
      },

      markHydrated: () => set({ hasHydrated: true }),

      get isAuthenticated() {
        return !!get().token
      }
    }),
    {
      name: 'iptv-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.defaults.headers.common.Authorization = `Bearer ${state.token}`
        }

        state?.markHydrated?.()
      }
    }
  )
)
