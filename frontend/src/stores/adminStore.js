import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiFetch } from '../config/api'

export const useAdminStore = create(
  persist(
    (set, get) => ({
      // State
      adminToken: null,
      adminUser: null,
      isLoading: false,
      error: null,
      _hasHydrated: false,

      // Actions
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await apiFetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          })

          const result = await response.json()

          if (!response.ok) {
            throw new Error(result.message || result.error || 'Giriş başarısız')
          }

          // Backend returns { status: 'success', data: { token, admin } }
          const { token, admin } = result.data || {}
          
          if (!token) {
            throw new Error('Token alınamadı')
          }

          console.log('[AdminStore] Login successful', { email, adminName: admin?.name })

          set({ 
            adminToken: token, 
            adminUser: admin,
            isLoading: false,
            error: null
          })
          return { success: true }
        } catch (error) {
          console.error('[AdminStore] Login failed', error.message)
          set({ error: error.message, isLoading: false })
          return { success: false, error: error.message }
        }
      },

      logout: () => {
        set({ 
          adminToken: null, 
          adminUser: null,
          error: null 
        })
      },

      fetchAdminProfile: async () => {
        const { adminToken } = get()
        if (!adminToken) return

        try {
          const response = await apiFetch('/admin/profile', {
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            set({ adminUser: data.data?.admin || data.admin || null })
          } else if (response.status === 401) {
            get().logout()
          }
        } catch (error) {
          console.error('Admin profile fetch error:', error)
        }
      },

      // Users Management
      fetchUsers: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          
          if (!response.ok) {
            // Try to parse error response for detailed message
            let errorMessage = 'Kullanıcılar getirilemedi'
            try {
              const errorData = await response.json()
              errorMessage = errorData.detail || errorData.message || errorMessage
            } catch (parseError) {
              // If parsing fails, use status text
              errorMessage = `HTTP ${response.status}: ${response.statusText}`
            }
            throw new Error(errorMessage)
          }
          
          return await response.json()
        } catch (error) {
          console.error('Fetch users error:', error)
          throw error
        }
      },

      updateUserPackage: async (userCode, packageData) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/users/${userCode}/package`, {
            method: 'PUT',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(packageData)
          })
          if (!response.ok) throw new Error('Paket güncellenemedi')
          return await response.json()
        } catch (error) {
          console.error('Update package error:', error)
          throw error
        }
      },

      extendUserExpiry: async (userCode, days) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/users/${userCode}/extend`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days })
          })
          if (!response.ok) throw new Error('Süre uzatılamadı')
          return await response.json()
        } catch (error) {
          console.error('Extend expiry error:', error)
          throw error
        }
      },

      updateUserM3U: async (userCode, m3uUrl) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/users/${userCode}/m3u`, {
            method: 'PUT',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ m3uUrl })
          })
          if (!response.ok) throw new Error('M3U güncellenemedi')
          return await response.json()
        } catch (error) {
          console.error('Update M3U error:', error)
          throw error
        }
      },

      // Packages Management
      fetchPackages: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/packages', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          
          if (!response.ok) {
            // Try to parse error response for detailed message
            let errorMessage = 'Paketler getirilemedi'
            try {
              const errorData = await response.json()
              errorMessage = errorData.detail || errorData.message || errorMessage
            } catch (parseError) {
              // If parsing fails, use status text
              errorMessage = `HTTP ${response.status}: ${response.statusText}`
            }
            throw new Error(errorMessage)
          }
          
          return await response.json()
        } catch (error) {
          console.error('Fetch packages error:', error)
          throw error
        }
      },

      createPackage: async (packageData) => {
        const { adminToken } = get()
        try {
          // Veritabanı yapısına uygun veri hazırla
          const dbData = {
            name: packageData.name,
            description: packageData.description,
            price: packageData.price,
            duration_days: (packageData.duration || 1) * 30, // Ayı güne çevir
          }
          
          const response = await apiFetch('/admin/packages', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(dbData)
          })
          if (!response.ok) throw new Error('Paket oluşturulamadı')
          return await response.json()
        } catch (error) {
          console.error('Create package error:', error)
          throw error
        }
      },

      updatePackage: async (packageId, packageData) => {
        const { adminToken } = get()
        try {
          // Veritabanı yapısına uygun veri hazırla
          const dbData = {
            name: packageData.name,
            description: packageData.description,
            price: packageData.price,
            duration_days: (packageData.duration || 1) * 30, // Ayı güne çevir
          }
          
          const response = await apiFetch(`/admin/packages/${packageId}`, {
            method: 'PUT',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(dbData)
          })
          if (!response.ok) throw new Error('Paket güncellenemedi')
          return await response.json()
        } catch (error) {
          console.error('Update package error:', error)
          throw error
        }
      },

      deletePackage: async (packageId) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/packages/${packageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Paket silinemedi')
          return await response.json()
        } catch (error) {
          console.error('Delete package error:', error)
          throw error
        }
      },

      // Payments
      fetchPayments: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/payments', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Ödemeler getirilemedi')
          return await response.json()
        } catch (error) {
          console.error('Fetch payments error:', error)
          throw error
        }
      },

      approvePayment: async (paymentId) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/payments/${paymentId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Ödeme onaylanamadı')
          return await response.json()
        } catch (error) {
          console.error('Approve payment error:', error)
          throw error
        }
      },

      rejectPayment: async (paymentId, reason) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/payments/${paymentId}/reject`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
          })
          if (!response.ok) throw new Error('Ödeme reddedilemedi')
          return await response.json()
        } catch (error) {
          console.error('Reject payment error:', error)
          throw error
        }
      },

      // Admins Management
      fetchAdmins: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/admins', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Adminler getirilemedi')
          return await response.json()
        } catch (error) {
          console.error('Fetch admins error:', error)
          throw error
        }
      },

      createAdmin: async (adminData) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/admins', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(adminData)
          })
          if (!response.ok) throw new Error('Admin oluşturulamadı')
          return await response.json()
        } catch (error) {
          console.error('Create admin error:', error)
          throw error
        }
      },

      deleteAdmin: async (adminId) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/admins/${adminId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Admin silinemedi')
          return await response.json()
        } catch (error) {
          console.error('Delete admin error:', error)
          throw error
        }
      },

      // Users - Delete
      deleteUser: async (userCode) => {
        const { adminToken } = get()
        try {
          const response = await apiFetch(`/admin/users/${userCode}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.message || 'Kullanıcı silinemedi')
          }
          return await response.json()
        } catch (error) {
          console.error('Delete user error:', error)
          throw error
        }
      },

      // Analytics
      fetchAnalytics: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/analytics', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Analiz verileri getirilemedi')
          return await response.json()
        } catch (error) {
          console.error('Fetch analytics error:', error)
          throw error
        }
      },

      fetchDashboardStats: async () => {
        const { adminToken } = get()
        try {
          const response = await apiFetch('/admin/dashboard', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          })
          if (!response.ok) throw new Error('Dashboard verileri getirilemedi')
          return await response.json()
        } catch (error) {
          console.error('Fetch dashboard error:', error)
          throw error
        }
      }
    }),
    {
      name: 'admin-storage',
      // Only persist token, not functions or loading states
      partialize: (state) => ({ 
        adminToken: state.adminToken,
        adminUser: state.adminUser
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true)
        }
      }
    }
  )
)
