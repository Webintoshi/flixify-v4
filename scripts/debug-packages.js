#!/usr/bin/env node
/**
 * Package Visibility Debug Script
 * 
 * This script helps diagnose package visibility issues:
 * 1. Checks database connection
 * 2. Lists all packages in the database
 * 3. Lists active packages (public view)
 * 4. Checks RLS policies
 * 5. Verifies API response format
 * 
 * Usage: node scripts/debug-packages.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Check .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugPackages() {
  console.log('🔍 Package Visibility Debug Tool\n');
  console.log('=' .repeat(50));
  
  try {
    // 1. Test connection
    console.log('\n📡 Testing database connection...');
    const { data: health, error: healthError } = await supabase
      .from('packages')
      .select('count', { count: 'exact', head: true });
    
    if (healthError) {
      console.error('❌ Connection failed:', healthError.message);
      return;
    }
    console.log('✅ Database connection successful');
    
    // 2. List all packages (admin view)
    console.log('\n📦 Listing ALL packages (admin view):');
    console.log('-'.repeat(50));
    const { data: allPackages, error: allError } = await supabase
      .from('packages')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (allError) {
      console.error('❌ Failed to fetch all packages:', allError.message);
    } else if (!allPackages || allPackages.length === 0) {
      console.log('⚠️  No packages found in database!');
    } else {
      console.log(`Found ${allPackages.length} packages:\n`);
      allPackages.forEach(pkg => {
        console.log(`  📋 ${pkg.name}`);
        console.log(`     ID: ${pkg.id}`);
        console.log(`     Price: ₺${pkg.price} | Duration: ${pkg.duration_days} days`);
        console.log(`     is_active: ${pkg.is_active} | is_popular: ${pkg.is_popular}`);
        console.log(`     badge: ${pkg.badge || 'null'} | sort_order: ${pkg.sort_order}`);
        console.log(`     features: ${JSON.stringify(pkg.features)}`);
        console.log('');
      });
    }
    
    // 3. List active packages (public view)
    console.log('\n📦 Listing ACTIVE packages (public view):');
    console.log('-'.repeat(50));
    const { data: activePackages, error: activeError } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (activeError) {
      console.error('❌ Failed to fetch active packages:', activeError.message);
      console.log('\n🚨 RLS POLICY ISSUE DETECTED!');
      console.log('   The error above indicates missing RLS policies.');
      console.log('   Run: database/migrations/002_fix_package_rls_and_policies.sql');
    } else if (!activePackages || activePackages.length === 0) {
      console.log('⚠️  No active packages found!');
      console.log('   Check if is_active column is set to true for your packages.');
    } else {
      console.log(`Found ${activePackages.length} active packages:\n`);
      activePackages.forEach(pkg => {
        console.log(`  ✅ ${pkg.name} - ₺${pkg.price} (${pkg.duration_days} days)`);
      });
    }
    
    // 4. Check table structure
    console.log('\n🔧 Checking packages table structure...');
    console.log('-'.repeat(50));
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'packages' })
      .catch(() => ({ data: null, error: true }));
    
    if (columnsError || !columns) {
      console.log('ℹ️  Could not fetch column info (rpc not available)');
    } else {
      console.log('Table columns:', columns);
    }
    
    // 5. Verify expected columns exist
    console.log('\n🔍 Verifying expected columns...');
    console.log('-'.repeat(50));
    const expectedColumns = [
      'id', 'name', 'description', 'price', 'duration_days', 
      'features', 'is_active', 'is_popular', 'badge', 'sort_order'
    ];
    
    if (allPackages && allPackages.length > 0) {
      const firstRow = allPackages[0];
      const missingColumns = expectedColumns.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        console.log('⚠️  Missing columns:', missingColumns.join(', '));
        console.log('   Run migration to add missing columns.');
      } else {
        console.log('✅ All expected columns exist');
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    
    if (!allPackages || allPackages.length === 0) {
      console.log('❌ CRITICAL: No packages in database');
      console.log('   → Run: database/seed_data.sql');
    } else if (!activePackages || activePackages.length === 0) {
      console.log('❌ CRITICAL: No active packages');
      console.log('   → Update packages to set is_active = true');
      console.log('   → Or check RLS policies if query failed');
    } else {
      console.log('✅ Packages are properly configured');
      console.log(`   Total: ${allPackages.length} | Active: ${activePackages.length}`);
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n');
  process.exit(0);
}

// Run debug
debugPackages();
