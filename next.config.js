/** @type {import('next').NextConfig} */
const path = require('path');
const fs = require('fs');

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
    ],
  },
  // Instead of transpiling, we'll mark these packages as external
  // This resolves the conflict between transpilePackages and serverExternalPackages
  serverExternalPackages: ['mjml', 'uglify-js', 'html-minifier'],
  
  // Disable server actions optimization that's causing path issues
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['localhost:3000']
    },
  },
  
  webpack: (config, { isServer }) => {
    // Fix path resolution issues
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    
    // Ensure node_modules are resolved correctly
    const modulesDir = path.resolve(__dirname, 'node_modules');
    
    // Add additional path resolving with specific patterns for the problematic paths
    config.resolve.alias = {
      ...config.resolve.alias,
      // Force Next.js to use the actual node_modules directory for these problematic packages
      'uglify-js': path.resolve(modulesDir, 'uglify-js'),
      'mjml': path.resolve(modulesDir, 'mjml'),
      
      // Add specific aliases for the virtual paths that Next.js uses
      '\\[project\\]/node_modules/uglify-js': path.resolve(modulesDir, 'uglify-js'),
      '\\[project\\]/node_modules/uglify-js/lib/utils.js': path.resolve(modulesDir, 'uglify-js/lib/utils.js'),
      '(action-browser)/node_modules/uglify-js': path.resolve(modulesDir, 'uglify-js'),
      '(action-browser)/node_modules/uglify-js/lib/utils.js': path.resolve(modulesDir, 'uglify-js/lib/utils.js'),
    };
    
    return config;
  },
};

module.exports = nextConfig; 