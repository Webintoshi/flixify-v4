/**
 * Supabase User Repository Implementation
 * 
 * Infrastructure adapter implementing UserRepository port.
 * Uses Supabase PostgreSQL with RLS policies.
 * 
 * Error Handling Strategy:
 * - Database errors: Log and throw domain-specific errors
 * - Connection errors: Throw ServiceUnavailableError
 * - Constraint violations: Throw ConflictError
 * - Not found: Return null (domain layer decides on 404)
 */

const UserRepository = require('../../application/ports/UserRepository');
const User = require('../../domain/entities/User');
const logger = require('../../config/logger');

class SupabaseUserRepository extends UserRepository {
  constructor(supabaseClient) {
    super();
    this._supabase = supabaseClient;
    this._table = 'users';
  }

  /**
   * Map database row to domain entity
   * 
   * CRITICAL: Wraps User.reconstitute in try-catch to handle data integrity issues
   * (e.g., active users without M3U URL in database). Returns null for invalid rows
   * to prevent 500 errors, but logs the issue for data cleanup.
   */
  _toDomain(data) {
    if (!data) return null;
    
    // Skip soft-deleted users in normal queries (they have deleted_at set)
    if (data.deleted_at) {
      return null;
    }
    
    try {
      return User.reconstitute({
        id: data.id,
        code: data.code,
        status: data.status,
        m3uUrl: data.m3u_url,
        expiresAt: data.expires_at,
        adminNotes: data.admin_notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        deletedAt: data.deleted_at
      });
    } catch (error) {
      // Log data integrity issue but don't crash the entire request
      logger.error('Data integrity error: Failed to reconstitute user from database', {
        userId: data.id,
        code: data.code?.substring(0, 4) + '****',
        status: data.status,
        hasM3uUrl: !!data.m3u_url,
        error: error.message
      });
      
      // Return null for this user - will be filtered out from results
      return null;
    }
  }

  /**
   * Map domain entity to database row
   */
  _toPersistence(user) {
    return user.toPersistence();
  }

  async findById(id) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)  // Exclude soft-deleted users
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return this._toDomain(data);
    } catch (error) {
      logger.error('Database error in findById', { error: error.message, id });
      throw new Error(`Failed to find user by ID: ${error.message}`);
    }
  }

  async findByCode(code) {
    try {
      const codeString = code.toString ? code.toString() : code;
      
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('code', codeString)
        .is('deleted_at', null)  // Exclude soft-deleted users
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return this._toDomain(data);
    } catch (error) {
      logger.error('Database error in findByCode', { error: error.message, code: code.toMaskedString?.() || code });
      throw new Error(`Failed to find user by code: ${error.message}`);
    }
  }

  async findAll({ limit = 50, offset = 0, status = null, includeDeleted = false } = {}) {
    try {
      let query = this._supabase
        .from(this._table)
        .select('*', { count: 'exact' });

      // Exclude soft-deleted users by default
      if (!includeDeleted) {
        query = query.is('deleted_at', null);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Filter out nulls (users that failed reconstitution due to data integrity issues)
      const users = data.map(row => this._toDomain(row)).filter(u => u !== null);
      
      // Log warning if some users were filtered out
      if (users.length < data.length) {
        logger.warn('Some users were filtered out due to data integrity issues', {
          totalInDb: data.length,
          validUsers: users.length,
          filteredOut: data.length - users.length
        });
      }

      return {
        users,
        total: count || 0
      };
    } catch (error) {
      logger.error('Database error in findAll', { error: error.message, limit, offset, status });
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
  }

  async findByStatus(status) {
    try {
      const statusString = status.toString ? status.toString() : status;
      
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('status', statusString)
        .is('deleted_at', null);  // Exclude soft-deleted users

      if (error) throw error;

      return data.map(row => this._toDomain(row)).filter(u => u !== null);
    } catch (error) {
      logger.error('Database error in findByStatus', { error: error.message, status });
      throw new Error(`Failed to find users by status: ${error.message}`);
    }
  }

  async findExpired() {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', now)
        .not('expires_at', 'is', null)
        .is('deleted_at', null);  // Exclude soft-deleted users

      if (error) throw error;

      return data.map(row => this._toDomain(row)).filter(u => u !== null);
    } catch (error) {
      logger.error('Database error in findExpired', { error: error.message });
      throw new Error(`Failed to find expired users: ${error.message}`);
    }
  }

  async save(user) {
    try {
      const persistence = this._toPersistence(user);
      delete persistence.id; // Let DB generate UUID

      const { data, error } = await this._supabase
        .from(this._table)
        .insert(persistence)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique violation
          throw new Error(`User with code ${user.code.toString()} already exists`);
        }
        throw error;
      }

      logger.info('User saved successfully', { code: user.code.toMaskedString() });
      return this._toDomain(data);
    } catch (error) {
      logger.error('Database error in save', { error: error.message, code: user.code.toMaskedString() });
      throw new Error(`Failed to save user: ${error.message}`);
    }
  }

  async update(user) {
    try {
      if (!user.id) {
        throw new Error('Cannot update user without ID');
      }

      const persistence = this._toPersistence(user);

      const { data, error } = await this._supabase
        .from(this._table)
        .update(persistence)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return null;

      logger.info('User updated successfully', { id: user.id, code: user.code.toMaskedString() });
      return this._toDomain(data);
    } catch (error) {
      logger.error('Database error in update', { error: error.message, id: user.id });
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Update user fields by ID
   */
  async updateById(id, fields) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .update(fields)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return null;

      logger.info('User fields updated successfully', { id, fields: Object.keys(fields) });
      return this._toDomain(data);
    } catch (error) {
      logger.error('Database error in updateById', { error: error.message, id });
      throw new Error(`Failed to update user fields: ${error.message}`);
    }
  }

  /**
   * Soft delete user (sets deleted_at timestamp)
   * User record preserved for analytics, payments remain intact
   */
  async delete(id) {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .update({ 
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('User not found');

      logger.info('User soft-deleted successfully', { id, code: data.code });
    } catch (error) {
      logger.error('Database error in delete', { error: error.message, id });
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * Hard delete user (permanent removal)
   * Use with caution - only for GDPR compliance or data cleanup
   */
  async permanentlyDelete(id) {
    try {
      const { error } = await this._supabase
        .from(this._table)
        .delete()
        .eq('id', id);

      if (error) throw error;

      logger.info('User permanently deleted', { id });
    } catch (error) {
      logger.error('Database error in permanent delete', { error: error.message, id });
      throw new Error(`Failed to permanently delete user: ${error.message}`);
    }
  }

  async existsByCode(code) {
    try {
      const codeString = code.toString ? code.toString() : code;
      
      const { count, error } = await this._supabase
        .from(this._table)
        .select('*', { count: 'exact', head: true })
        .eq('code', codeString);

      if (error) throw error;

      return count > 0;
    } catch (error) {
      logger.error('Database error in existsByCode', { error: error.message });
      throw new Error(`Failed to check code existence: ${error.message}`);
    }
  }

  async countByStatus() {
    try {
      const { data, error } = await this._supabase
        .from(this._table)
        .select('status', { count: 'exact' })
        .is('deleted_at', null);  // Exclude soft-deleted users

      if (error) throw error;

      const counts = {
        pending: 0,
        active: 0,
        suspended: 0,
        expired: 0,
        total: data.length
      };

      data.forEach(row => {
        if (counts[row.status] !== undefined) {
          counts[row.status]++;
        }
      });

      return counts;
    } catch (error) {
      logger.error('Database error in countByStatus', { error: error.message });
      throw new Error(`Failed to count users by status: ${error.message}`);
    }
  }

  async findRecent(days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const { data, error } = await this._supabase
        .from(this._table)
        .select('*')
        .gte('created_at', cutoffDate.toISOString())
        .is('deleted_at', null)  // Exclude soft-deleted users
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(row => this._toDomain(row)).filter(u => u !== null);
    } catch (error) {
      logger.error('Database error in findRecent', { error: error.message, days });
      return [];
    }
  }

  /**
   * Get user statistics including deleted users (for analytics)
   */
  async getAnalyticsCounts() {
    try {
      // Active users count
      const { count: activeCount, error: activeError } = await this._supabase
        .from(this._table)
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      if (activeError) throw activeError;

      // Deleted users count
      const { count: deletedCount, error: deletedError } = await this._supabase
        .from(this._table)
        .select('*', { count: 'exact', head: true })
        .not('deleted_at', 'is', null);

      if (deletedError) throw deletedError;

      return {
        active: activeCount || 0,
        deleted: deletedCount || 0,
        total: (activeCount || 0) + (deletedCount || 0)
      };
    } catch (error) {
      logger.error('Database error in getAnalyticsCounts', { error: error.message });
      throw new Error(`Failed to get analytics counts: ${error.message}`);
    }
  }
}

module.exports = SupabaseUserRepository;
