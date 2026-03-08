/**
 * Package Controller - STATIK PAKETLER
 * Database bağlantısı olmadan çalışır
 */

// Statik paketler (veritabanı yerine)
const STATIC_PACKAGES = [
  {
    id: '33d43b01-397f-4656-846f-d08da9c96cdf',
    name: '1 Aylık Paket',
    description: '30 gün erişim - Temel paket',
    price: 199.00,
    duration: 1,
    duration_days: 30,
    durationMonths: 1,
    features: ['30 gün erişim', 'HD Kalite', '7/24 Destek'],
    badge: null,
    isPopular: false,
    isActive: true,
    is_active: true,
    sort_order: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'b41ecdb8-9618-4f65-901a-862e987c3063',
    name: '3 Aylık Paket',
    description: '90 gün erişim - %5 İndirimli',
    price: 485.00,
    duration: 3,
    duration_days: 90,
    durationMonths: 3,
    features: ['90 gün erişim', 'HD Kalite', '7/24 Destek', '%5 İndirim'],
    badge: '%5 İndirim',
    isPopular: false,
    isActive: true,
    is_active: true,
    sort_order: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '1aa84dca-7a5a-4af7-946d-3ca1ffa0e8b9',
    name: '6 Aylık Paket',
    description: '180 gün erişim - %10 İndirimli - Popüler',
    price: 820.00,
    duration: 6,
    duration_days: 180,
    durationMonths: 6,
    features: ['180 gün erişim', 'HD Kalite', '7/24 Destek', '%10 İndirim', 'Popüler'],
    badge: 'Popüler',
    isPopular: true,
    isActive: true,
    is_active: true,
    sort_order: 3,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '623816cc-acab-43c8-a0b5-f1cdfa686def',
    name: '12 Aylık Paket',
    description: '365 gün erişim - %20 İndirimli - En İyi Fiyat',
    price: 1490.00,
    duration: 12,
    duration_days: 365,
    durationMonths: 12,
    features: ['365 gün erişim', 'HD Kalite', '7/24 Destek', '%20 İndirim', 'En İyi Fiyat'],
    badge: 'En İyi Fiyat',
    isPopular: false,
    isActive: true,
    is_active: true,
    sort_order: 4,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
];

class PackageController {
  constructor() {
    // Database bağlantısı gerekmez
  }

  // GET /api/v1/packages/public - Get all active packages (public)
  async getPublicPackages(req, res) {
    try {
      const activePackages = STATIC_PACKAGES.filter(p => p.isActive);
      
      res.json({
        status: 'success',
        data: {
          packages: activePackages.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            duration: p.durationMonths,
            duration_days: p.duration_days,
            features: p.features,
            badge: p.badge,
            isPopular: p.isPopular,
            is_active: p.is_active
          }))
        }
      })
    } catch (error) {
      console.error('Get public packages error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Paketler yüklenemedi'
      })
    }
  }

  // GET /api/v1/admin/packages - Get all packages (admin)
  async getAllPackages(req, res) {
    try {
      res.json({
        status: 'success',
        data: {
          packages: STATIC_PACKAGES.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            duration: p.durationMonths,
            duration_days: p.duration_days,
            features: p.features,
            badge: p.badge,
            isPopular: p.isPopular,
            isActive: p.isActive,
            sort_order: p.sort_order,
            created_at: p.createdAt,
            updated_at: p.updatedAt
          }))
        }
      })
    } catch (error) {
      console.error('Get all packages error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Paketler yüklenemedi'
      })
    }
  }

  // POST /api/v1/admin/packages - Create package (admin) - STATIK
  async createPackage(req, res) {
    try {
      // Statik modda yeni paket oluşturulamaz, sadece mevcut paketleri döndür
      res.status(403).json({
        status: 'error',
        message: 'Statik modda paket oluşturulamaz. Veritabanı bağlantısı gerekli.'
      })
    } catch (error) {
      console.error('Create package error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Paket oluşturulamadı: ' + error.message
      })
    }
  }

  // PUT /api/v1/admin/packages/:id - Update package (admin) - STATIK
  async updatePackage(req, res) {
    try {
      const { id } = req.params
      
      // Statik paketi bul
      const pkg = STATIC_PACKAGES.find(p => p.id === id)
      if (!pkg) {
        return res.status(404).json({
          status: 'error',
          message: 'Paket bulunamadı'
        })
      }
      
      // Not: Statik modda gerçek güncelleme yapılmaz, sadece başarılı yanıt döner
      res.json({
        status: 'success',
        message: 'Paket güncellendi (statik mod)',
        data: { 
          package: {
            ...pkg,
            ...req.body,
            id: pkg.id // ID değişmez
          }
        }
      })
    } catch (error) {
      console.error('Update package error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Paket güncellenemedi: ' + error.message
      })
    }
  }

  // DELETE /api/v1/admin/packages/:id - Delete package (admin) - STATIK
  async deletePackage(req, res) {
    try {
      const { id } = req.params
      
      // Statik paketi bul
      const pkg = STATIC_PACKAGES.find(p => p.id === id)
      if (!pkg) {
        return res.status(404).json({
          status: 'error',
          message: 'Paket bulunamadı'
        })
      }
      
      // Not: Statik modda gerçek silme yapılmaz
      res.json({
        status: 'success',
        message: 'Paket silindi (statik mod)'
      })
    } catch (error) {
      console.error('Delete package error:', error)
      res.status(500).json({
        status: 'error',
        message: 'Paket silinemedi: ' + error.message
      })
    }
  }
}

module.exports = PackageController
