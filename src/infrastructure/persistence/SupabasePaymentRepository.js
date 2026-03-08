/**
 * Supabase Payment Repository Implementation
 */

const logger = require('../../config/logger');

class SupabasePaymentRepository {
  constructor(supabaseClient) {
    this._supabase = supabaseClient;
    this._table = 'payments';
  }

  async findAll({ status = null, limit = 50, offset = 0 } = {}) {
    try {
      let query = this._supabase
        .from(this._table)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { payments: data || [], total: count || 0 };
    } catch (error) {
      logger.error('Database error in findAll', { error: error.message });
      throw error;
    }
  }

  async findById(id) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Database error in findById', { error: error.message });
      throw error;
    }
  }

  async findByUserId(userId) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Database error in findByUserId', { error: error.message });
      throw error;
    }
  }

  async create(paymentData) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .insert(paymentData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in create', { error: error.message });
      throw error;
    }
  }

  async approve(id, adminId) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .update({
          status: 'approved',
          processed_by: adminId,
          processed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in approve', { error: error.message });
      throw error;
    }
  }

  async reject(id, adminId, reason) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .update({
          status: 'rejected',
          reject_reason: reason,
          processed_by: adminId,
          processed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in reject', { error: error.message });
      throw error;
    }
  }

  async getStats() {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('status');

      if (error) throw error;

      const stats = {
        total: data.length,
        pending: data.filter(p => p.status === 'pending').length,
        approved: data.filter(p => p.status === 'approved').length,
        rejected: data.filter(p => p.status === 'rejected').length
      };

      return stats;
    } catch (error) {
      logger.error('Database error in getStats', { error: error.message });
      throw error;
    }
  }
}

module.exports = SupabasePaymentRepository;
