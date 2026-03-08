// Package Entity - Veritabanı yapısına uygun
class Package {
  constructor({
    id,
    name,
    description,
    price,
    duration_days,
    duration,
    features = [],
    badge,
    isPopular,
    isActive = true,
    sort_order,
    createdAt,
    updatedAt
  }) {
    this.id = id
    this.name = name
    this.description = description || ''
    this.price = parseFloat(price)
    // duration_days öncelikli, yoksa duration kullan
    this.duration_days = parseInt(duration_days || duration || 30)
    this.features = Array.isArray(features) ? features : []
    this.isActive = isActive !== false
    this.sort_order = parseInt(sort_order || 0)
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    
    // Badge hesapla (veritabanında yok)
    this.badge = badge || this._calculateBadge()
    // isPopular hesapla (sort_order 3 = popüler)
    this.isPopular = isPopular !== undefined ? isPopular : (this.sort_order === 3)
  }

  // Badge değerini duration_days'a göre hesapla
  _calculateBadge() {
    if (this.duration_days >= 365) return 'En İyi'
    if (this.duration_days >= 180) return 'Popüler'
    if (this.duration_days >= 90) return '%5 İndirim'
    return null
  }

  // Toplam fiyat (TL)
  get totalPrice() {
    return this.price
  }

  // Aylık fiyat (gün bazlı hesaplama: 30 gün = 1 ay)
  get monthlyPrice() {
    return Math.round(this.price / (this.duration_days / 30))
  }

  // Kaç aylık paket (30 gün = 1 ay)
  get durationMonths() {
    return Math.round(this.duration_days / 30)
  }

  // API yanıtı için JSON formatı
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      price: this.price,
      duration: this.durationMonths,  // Ay olarak (1, 3, 6, 12)
      duration_days: this.duration_days,  // Gün olarak (30, 90, 180, 365)
      duration_months: this.durationMonths,
      features: this.features,
      badge: this.badge,
      is_popular: this.isPopular,
      is_active: this.isActive,
      sort_order: this.sort_order,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    }
  }
}

module.exports = Package
