/**
 * User Repository Port (Interface)
 * 
 * Defines the contract for user persistence operations.
 * Infrastructure adapters must implement this interface.
 * 
 * This follows the Dependency Inversion Principle (DIP) -
 * Domain depends on abstraction, not concrete implementation.
 */

class UserRepository {
  /**
   * Find user by unique identifier
   * @param {string} id - UUID
   * @returns {Promise<User|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented: findById');
  }

  /**
   * Find user by 16-digit code
   * @param {Code} code - Code value object
   * @returns {Promise<User|null>}
   */
  async findByCode(code) {
    throw new Error('Method not implemented: findByCode');
  }

  /**
   * Find all users with pagination
   * @param {Object} options - { limit, offset, status }
   * @returns {Promise<{ users: User[], total: number }>}
   */
  async findAll(options = {}) {
    throw new Error('Method not implemented: findAll');
  }

  /**
   * Find users by status (for cron jobs)
   * @param {UserStatus} status
   * @returns {Promise<User[]>}
   */
  async findByStatus(status) {
    throw new Error('Method not implemented: findByStatus');
  }

  /**
   * Find expired active users (for cleanup cron)
   * @returns {Promise<User[]>}
   */
  async findExpired() {
    throw new Error('Method not implemented: findExpired');
  }

  /**
   * Save new user
   * @param {User} user
   * @returns {Promise<User>}
   */
  async save(user) {
    throw new Error('Method not implemented: save');
  }

  /**
   * Update existing user
   * @param {User} user
   * @returns {Promise<User>}
   */
  async update(user) {
    throw new Error('Method not implemented: update');
  }

  /**
   * Delete user (soft delete recommended)
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error('Method not implemented: delete');
  }

  /**
   * Check if code already exists
   * @param {Code} code
   * @returns {Promise<boolean>}
   */
  async existsByCode(code) {
    throw new Error('Method not implemented: existsByCode');
  }

  /**
   * Count users by status (for metrics)
   * @returns {Promise<Object>}
   */
  async countByStatus() {
    throw new Error('Method not implemented: countByStatus');
  }
}

module.exports = UserRepository;
