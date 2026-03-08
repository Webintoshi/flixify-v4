// Package Repository Interface
class PackageRepository {
  async findAll() {
    throw new Error('Method not implemented')
  }

  async findAllActive() {
    throw new Error('Method not implemented')
  }

  async findById(id) {
    throw new Error('Method not implemented')
  }

  async create(packageData) {
    throw new Error('Method not implemented')
  }

  async update(id, packageData) {
    throw new Error('Method not implemented')
  }

  async delete(id) {
    throw new Error('Method not implemented')
  }
}

module.exports = PackageRepository
