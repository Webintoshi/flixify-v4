const PackageRepository = require('../../domain/repositories/PackageRepository')
const Package = require('../../domain/entities/Package')

class SupabasePackageRepository extends PackageRepository {
  constructor(supabaseClient) {
    super()
    this.supabase = supabaseClient
  }

  async findAll() {
    const { data, error } = await this.supabase
      .from('packages')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data.map(p => this._toEntity(p))
  }

  async findAllActive() {
    const { data, error } = await this.supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data.map(p => this._toEntity(p))
  }

  async findById(id) {
    const { data, error } = await this.supabase
      .from('packages')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data ? this._toEntity(data) : null
  }

  async create(packageData) {
    const durationInput = packageData.duration_days || packageData.duration || 30
    const durationDays = durationInput <= 12 ? durationInput * 30 : durationInput
    
    const dbData = {
      name: packageData.name,
      description: packageData.description,
      price: packageData.price,
      duration_days: durationDays,
      features: packageData.features || [],
      is_active: packageData.isActive !== false,
      sort_order: packageData.sort_order || this._calculateSortOrder(durationDays)
    }

    const { data, error } = await this.supabase
      .from('packages')
      .insert([dbData])
      .select()
      .single()
    if (error) throw error
    return this._toEntity(data)
  }

  async update(id, packageData) {
    const existing = await this.findById(id)
    if (!existing) throw new Error('Package not found')
    
    let durationDays = existing.duration_days
    if (packageData.duration_days !== undefined || packageData.duration !== undefined) {
      const durationInput = packageData.duration_days || packageData.duration
      durationDays = durationInput && durationInput <= 12 ? durationInput * 30 : durationInput
    }
    
    const dbData = {
      name: packageData.name !== undefined ? packageData.name : existing.name,
      description: packageData.description !== undefined ? packageData.description : existing.description,
      price: packageData.price !== undefined ? packageData.price : existing.price,
      duration_days: durationDays,
      features: packageData.features !== undefined ? packageData.features : existing.features,
      is_active: packageData.isActive !== undefined ? packageData.isActive : existing.isActive,
      sort_order: packageData.sort_order !== undefined ? packageData.sort_order : this._calculateSortOrder(durationDays)
    }

    const { data, error } = await this.supabase
      .from('packages')
      .update(dbData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return this._toEntity(data)
  }

  async delete(id) {
    const { error } = await this.supabase
      .from('packages')
      .delete()
      .eq('id', id)
    if (error) throw error
    return true
  }

  _calculateSortOrder(duration) {
    const days = parseInt(duration) || 30
    if (days >= 365) return 4
    if (days >= 180) return 3
    if (days >= 90) return 2
    return 1
  }

  _toEntity(row) {
    return new Package({
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      duration_days: row.duration_days,
      features: row.features || [],
      badge: row.badge,
      isPopular: row.is_popular,
      isActive: row.is_active,
      sort_order: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })
  }
}

module.exports = SupabasePackageRepository
