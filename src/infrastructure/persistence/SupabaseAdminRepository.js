/**
 * Supabase Admin Repository Implementation
 */

const logger = require('../../config/logger');

class SupabaseAdminRepository {
  constructor(supabaseClient) {
    this._supabase = supabaseClient;
    this._table = 'admins';
  }

  async findByEmail(email) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Database error in findByEmail', { error: error.message });
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

  async findAll() {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Database error in findAll', { error: error.message });
      throw error;
    }
  }

  async create(adminData) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .insert(adminData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in create', { error: error.message });
      throw error;
    }
  }

  async update(id, updates) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in update', { error: error.message });
      throw error;
    }
  }

  async delete(id) {
    try {
      const { error } = await this._supabase
        .from(this._table)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Database error in delete', { error: error.message });
      throw error;
    }
  }

  async updateLastLogin(id) {
    try {
      await this._supabase
        .from(this._table)
        .update({ last_login: new Date().toISOString() })
        .eq('id', id);
    } catch (error) {
      logger.error('Database error in updateLastLogin', { error: error.message });
    }
  }

  // Payments
  async getPayments() {
    try {
      const { data, error } = await this._supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data: data || [] };
    } catch (error) {
      logger.error('Database error in getPayments', { error: error.message });
      return { data: [], error };
    }
  }

  async approvePayment(id, adminId) {
    try {
      const { data, error } = await this._supabase
        .from('payments')
        .update({ 
          status: 'approved', 
          approved_by: adminId,
          approved_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in approvePayment', { error: error.message });
      throw error;
    }
  }

  async rejectPayment(id, adminId, reason) {
    try {
      const { data, error } = await this._supabase
        .from('payments')
        .update({ 
          status: 'rejected', 
          rejected_by: adminId,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in rejectPayment', { error: error.message });
      throw error;
    }
  }

  // Packages
  async getPackages() {
    try {
      const { data, error } = await this._supabase
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data: data || [] };
    } catch (error) {
      logger.error('Database error in getPackages', { error: error.message });
      return { data: [], error };
    }
  }

  async createPackage(packageData) {
    try {
      const { data, error } = await this._supabase
        .from('packages')
        .insert(packageData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in createPackage', { error: error.message });
      throw error;
    }
  }

  async updatePackage(id, packageData) {
    try {
      const { data, error } = await this._supabase
        .from('packages')
        .update({ ...packageData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in updatePackage', { error: error.message });
      throw error;
    }
  }

  async deletePackage(id) {
    try {
      const { error } = await this._supabase
        .from('packages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Database error in deletePackage', { error: error.message });
      throw error;
    }
  }

  // Admins
  async getAdmins() {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { data: data || [] };
    } catch (error) {
      logger.error('Database error in getAdmins', { error: error.message });
      return { data: [], error };
    }
  }

  async createAdmin(adminData) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .insert(adminData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Database error in createAdmin', { error: error.message });
      throw error;
    }
  }

  async deleteAdmin(id) {
    try {
      const { error } = await this._supabase
        .from(this._table)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Database error in deleteAdmin', { error: error.message });
      throw error;
    }
  }

  // Analytics
  async getDailyStats(days = 30) {
    try {
      const { data, error } = await this._supabase
        .from('users')
        .select('created_at, status')
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      // Group by date
      const stats = {};
      data.forEach(user => {
        const date = user.created_at.split('T')[0];
        if (!stats[date]) stats[date] = { date, count: 0 };
        stats[date].count++;
      });

      return Object.values(stats).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      logger.error('Database error in getDailyStats', { error: error.message });
      return [];
    }
  }

  /**
   * Get user statistics including payment and device counts
   * Used for delete confirmation dialog
   */
  async getUserStats(userId) {
    try {
      // Get payment count
      const { count: paymentCount, error: paymentError } = await this._supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (paymentError) throw paymentError;

      // Get device count
      const { count: deviceCount, error: deviceError } = await this._supabase
        .from('devices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (deviceError) throw deviceError;

      // Get total payment amount
      const { data: payments, error: amountError } = await this._supabase
        .from('payments')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'approved');

      if (amountError) throw amountError;

      const totalAmount = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      return {
        payments: paymentCount || 0,
        devices: deviceCount || 0,
        totalAmount: totalAmount
      };
    } catch (error) {
      logger.error('Database error in getUserStats', { error: error.message, userId });
      throw error;
    }
  }
}

module.exports = SupabaseAdminRepository;
