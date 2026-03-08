/**
 * Supabase Device Repository
 */

class SupabaseDeviceRepository {
  constructor(supabaseClient) {
    this._supabase = supabaseClient;
  }

  async findByUserId(userId) {
    const { data, error } = await this._supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_active', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async findActiveByUserId(userId) {
    const { data, error } = await this._supabase
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_active', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async create(deviceData) {
    const { data, error } = await this._supabase
      .from('devices')
      .insert([deviceData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateLastActive(deviceId) {
    const { error } = await this._supabase
      .from('devices')
      .update({ last_active: new Date().toISOString() })
      .eq('id', deviceId);

    if (error) throw error;
  }

  async deactivate(deviceId, userId) {
    const { error } = await this._supabase
      .from('devices')
      .update({ is_active: false })
      .eq('id', deviceId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async delete(deviceId, userId) {
    const { error } = await this._supabase
      .from('devices')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

module.exports = SupabaseDeviceRepository;
