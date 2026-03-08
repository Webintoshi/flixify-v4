#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * Usage:
 *   node scripts/setup-database.js [schema|seed|all]
 * 
 * Environment Variables Required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`)
};

// Check environment variables
function checkEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    log.error(`Missing environment variables: ${missing.join(', ')}`);
    log.info('Please set them or create a .env file');
    process.exit(1);
  }
}

// Read SQL file
function readSQL(filename) {
  const filepath = path.join(__dirname, '..', 'database', filename);
  if (!fs.existsSync(filepath)) {
    log.error(`SQL file not found: ${filepath}`);
    process.exit(1);
  }
  return fs.readFileSync(filepath, 'utf8');
}

// Execute SQL
async function executeSQL(supabase, sql, description) {
  log.info(`Executing: ${description}...`);
  
  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
    
    for (const statement of statements) {
      const { error } = await supabase.rpc('exec_sql', { 
        sql: statement + ';' 
      });
      
      if (error) {
        // Try alternative method
        const { error: err2 } = await supabase
          .from('_sql')
          .select('*')
          .eq('query', statement);
          
        if (err2) {
          log.warn(`Statement skipped (may already exist): ${statement.substring(0, 50)}...`);
        }
      }
    }
    
    log.success(`${description} completed!`);
    return true;
  } catch (err) {
    log.error(`${description} failed: ${err.message}`);
    return false;
  }
}

// Alternative: Use Supabase REST API for seed data
async function seedData(supabase) {
  log.info('Seeding data...');
  
  try {
    // Check if admin exists
    const { data: existingAdmin, error: adminCheckError } = await supabase
      .from('admins')
      .select('id')
      .eq('email', 'admin@flixify.com')
      .single();
    
    if (!existingAdmin) {
      // Insert default admin
      const { error: adminError } = await supabase
        .from('admins')
        .insert({
          name: 'Super Admin',
          email: 'admin@flixify.com',
          password_hash: '$2b$10$X7oMybvz1xhfZg0qqP3hQexLRY5TpNgUzP9f9VJp3YhQJqLmQqKzW',
          role: 'super'
        });
      
      if (adminError) {
        log.warn(`Admin insert: ${adminError.message}`);
      } else {
        log.success('Default admin created');
      }
    } else {
      log.info('Admin already exists, skipping...');
    }
    
    // Check if packages exist
    const { data: existingPackages, error: pkgCheckError } = await supabase
      .from('packages')
      .select('id')
      .limit(1);
    
    if (!existingPackages || existingPackages.length === 0) {
      // Insert default packages
      const packages = [
        {
          name: 'Temel Paket',
          description: 'Başlangıç seviyesi IPTV deneyimi. 100+ kanal.',
          price: 49.99,
          duration_days: 30,
          features: ['100+ Kanal', 'SD Kalite', '7/24 Destek'],
          is_active: true,
          sort_order: 1
        },
        {
          name: 'Standart Paket',
          description: 'En popüler seçim! 500+ kanal, HD kalite.',
          price: 99.99,
          duration_days: 30,
          features: ['500+ Kanal', 'HD Kalite', 'Film & Dizi', '7/24 Destek'],
          is_active: true,
          sort_order: 2
        },
        {
          name: 'Premium Paket',
          description: 'Tam IPTV deneyimi. 1000+ kanal, 4K kalite.',
          price: 149.99,
          duration_days: 30,
          features: ['1000+ Kanal', '4K Kalite', 'Film & Dizi', 'Canlı Spor', 'Uluslararası Kanallar'],
          is_active: true,
          sort_order: 3
        },
        {
          name: 'Aile Paketi',
          description: '4 cihazda eşzamanlı izleme ve çocuk kanalları.',
          price: 199.99,
          duration_days: 30,
          features: ['1000+ Kanal', '4K Kalite', 'Çocuk Kanalları', 'Eşzamanlı 4 Cihaz'],
          is_active: true,
          sort_order: 4
        }
      ];
      
      const { error: pkgError } = await supabase
        .from('packages')
        .insert(packages);
      
      if (pkgError) {
        log.warn(`Packages insert: ${pkgError.message}`);
      } else {
        log.success('Default packages created');
      }
    } else {
      log.info('Packages already exist, skipping...');
    }
    
    log.success('Data seeding completed!');
    return true;
  } catch (err) {
    log.error(`Seeding failed: ${err.message}`);
    return false;
  }
}

// Verify database setup
async function verifySetup(supabase) {
  log.info('Verifying database setup...');
  
  const checks = [
    { table: 'users', name: 'Users table' },
    { table: 'admins', name: 'Admins table' },
    { table: 'packages', name: 'Packages table' },
    { table: 'payments', name: 'Payments table' },
    { table: 'user_packages', name: 'User packages table' },
    { table: 'activity_logs', name: 'Activity logs table' }
  ];
  
  let allGood = true;
  
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      log.error(`${check.name}: MISSING (${error.message})`);
      allGood = false;
    } else {
      log.success(`${check.name}: OK`);
    }
  }
  
  // Check storage bucket
  const { data: buckets, error: bucketError } = await supabase
    .storage
    .listBuckets();
  
  if (!bucketError && buckets.find(b => b.name === 'payment-receipts')) {
    log.success('Storage bucket (payment-receipts): OK');
  } else {
    log.warn('Storage bucket (payment-receipts): MISSING - Create in Supabase dashboard');
  }
  
  return allGood;
}

// Main function
async function main() {
  const command = process.argv[2] || 'all';
  
  console.log(`${colors.blue}
╔════════════════════════════════════════╗
║    FLIXIFY DATABASE SETUP SCRIPT      ║
╚════════════════════════════════════════╝
${colors.reset}`);
  
  // Load .env if exists
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    log.info('Loaded environment from .env');
  }
  
  checkEnv();
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  switch (command) {
    case 'schema':
      log.info('Setting up database schema...');
      log.warn('Note: Schema must be applied via Supabase SQL Editor');
      log.info('File: database/supabase-schema.sql');
      break;
      
    case 'seed':
      await seedData(supabase);
      break;
      
    case 'verify':
      await verifySetup(supabase);
      break;
      
    case 'all':
      log.info('Running full setup...');
      await seedData(supabase);
      console.log('');
      await verifySetup(supabase);
      break;
      
    default:
      console.log(`
Usage: node scripts/setup-database.js [command]

Commands:
  schema  - Show schema file location
  seed    - Insert default data (admin, packages)
  verify  - Check database setup
  all     - Run seed + verify (default)

Environment Variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
      `);
  }
  
  console.log(`${colors.green}\n✅ Setup script completed!${colors.reset}\n`);
}

main().catch(err => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
