// This file serves as a patch for the missing utils.js in uglify-js
const fs = require('fs');
const path = require('path');

try {
  console.log('ClubPulse Turbopack Compatibility Patch Starting...');
  
  // Define the paths - Use forward slashes even on Windows for consistency
  const uglifyJsPath = path.resolve(__dirname, 'node_modules/uglify-js').replace(/\\/g, '/');
  const utilsPath = path.join(uglifyJsPath, 'lib', 'utils.js').replace(/\\/g, '/');
  
  console.log('Using normalized paths for compatibility:');
  console.log('- Uglify-js path:', uglifyJsPath);
  console.log('- Utils.js path:', utilsPath);
  
  // Create the [project] folder structure if it doesn't exist
  const projectLibPath = path.resolve(__dirname, '[project]', 'node_modules', 'uglify-js', 'lib').replace(/\\/g, '/');
  
  if (!fs.existsSync(projectLibPath)) {
    fs.mkdirSync(projectLibPath, { recursive: true });
    console.log('Created directory structure:', projectLibPath);
  }
  
  // Copy the utils.js file if it exists
  if (fs.existsSync(utilsPath)) {
    const targetUtilsPath = path.join(projectLibPath, 'utils.js').replace(/\\/g, '/');
    fs.copyFileSync(utilsPath, targetUtilsPath);
    console.log('Copied utils.js to:', targetUtilsPath);
  } else {
    console.error('Source utils.js not found at:', utilsPath);
    
    // Create a fallback utils.js if the original doesn't exist
    const fallbackUtils = `
      // Fallback utils.js file for uglify-js to prevent module not found errors
      module.exports = {
        // Basic utility functions from uglify-js
        defaults: function(args, defs) {
          var ret = {};
          if (args === true) args = {};
          for (var i in defs) if (defs.hasOwnProperty(i)) {
              ret[i] = (args && args.hasOwnProperty(i)) ? args[i] : defs[i];
          }
          return ret;
        },
        isEmpty: function(obj) {
          for (var i in obj) return false;
          return true;
        },
        each: function(obj, cb) {
          if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
              cb(obj[i], i);
            }
          } else {
            for (var key in obj) {
              if (obj.hasOwnProperty(key)) {
                cb(obj[key], key);
              }
            }
          }
        }
      };
    `;
    
    const fallbackPath = path.join(projectLibPath, 'utils.js').replace(/\\/g, '/');
    fs.writeFileSync(fallbackPath, fallbackUtils);
    console.log('Created fallback utils.js at:', fallbackPath);
  }
  
  // Create the (action-browser) folder structure if it doesn't exist
  const actionBrowserPath = path.resolve(__dirname, '(action-browser)', 'node_modules', 'uglify-js', 'lib').replace(/\\/g, '/');
  
  if (!fs.existsSync(actionBrowserPath)) {
    fs.mkdirSync(actionBrowserPath, { recursive: true });
    console.log('Created directory structure:', actionBrowserPath);
  }
  
  // Copy the utils.js file to action-browser path
  if (fs.existsSync(utilsPath)) {
    const targetActionPath = path.join(actionBrowserPath, 'utils.js').replace(/\\/g, '/');
    fs.copyFileSync(utilsPath, targetActionPath);
    console.log('Copied utils.js to:', targetActionPath);
  } else if (fs.existsSync(path.join(projectLibPath, 'utils.js'))) {
    // If we created a fallback, use that
    const sourceFallback = path.join(projectLibPath, 'utils.js').replace(/\\/g, '/');
    const targetActionPath = path.join(actionBrowserPath, 'utils.js').replace(/\\/g, '/');
    fs.copyFileSync(sourceFallback, targetActionPath);
    console.log('Copied fallback utils.js to:', targetActionPath);
  }
  
  // --- MJML handling ---
  
  // Create paths for MJML module in virtual directories
  const mjmlPath = path.resolve(__dirname, 'node_modules/mjml').replace(/\\/g, '/');
  const mjmlProjectPath = path.resolve(__dirname, '[project]/node_modules/mjml').replace(/\\/g, '/');
  const mjmlActionPath = path.resolve(__dirname, '(action-browser)/node_modules/mjml').replace(/\\/g, '/');
  
  // Create the containing directory for MJML if it doesn't exist
  if (!fs.existsSync(path.dirname(mjmlProjectPath))) {
    fs.mkdirSync(path.dirname(mjmlProjectPath), { recursive: true });
  }
  
  if (!fs.existsSync(path.dirname(mjmlActionPath))) {
    fs.mkdirSync(path.dirname(mjmlActionPath), { recursive: true });
  }
  
  // Create index.js files for better module resolution
  const createIndexFile = (indexPath) => {
    const contents = `
      // Forward module.exports from the real mjml package
      const mjml = require('mjml');
      module.exports = mjml;
    `;
    fs.writeFileSync(indexPath, contents);
  };
  
  // Create the MJML directories and index files
  if (!fs.existsSync(mjmlProjectPath)) {
    fs.mkdirSync(mjmlProjectPath, { recursive: true });
    createIndexFile(path.join(mjmlProjectPath, 'index.js'));
    console.log('Created MJML index.js at:', mjmlProjectPath);
  }
  
  if (!fs.existsSync(mjmlActionPath)) {
    fs.mkdirSync(mjmlActionPath, { recursive: true });
    createIndexFile(path.join(mjmlActionPath, 'index.js'));
    console.log('Created MJML index.js at:', mjmlActionPath);
  }
  
  if (fs.existsSync(mjmlPath)) {
    console.log('Copying essential MJML files to virtual paths for Turbopack compatibility...');
    
    // Copy the core files that might be needed
    const essentialFiles = ['package.json', 'index.js', 'LICENSE', 'README.md'];
    essentialFiles.forEach(file => {
      const source = path.join(mjmlPath, file);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(mjmlProjectPath, file));
        fs.copyFileSync(source, path.join(mjmlActionPath, file));
        console.log(`Copied ${file} to virtual MJML paths`);
      }
    });
    
    // Create lib directories if needed
    const libDirs = ['lib', 'bin'];
    libDirs.forEach(dir => {
      const sourcePath = path.join(mjmlPath, dir);
      if (fs.existsSync(sourcePath) && fs.lstatSync(sourcePath).isDirectory()) {
        const targetProjectPath = path.join(mjmlProjectPath, dir);
        const targetActionPath = path.join(mjmlActionPath, dir);
        
        if (!fs.existsSync(targetProjectPath)) {
          fs.mkdirSync(targetProjectPath, { recursive: true });
        }
        
        if (!fs.existsSync(targetActionPath)) {
          fs.mkdirSync(targetActionPath, { recursive: true });
        }
        
        // Create proxy index.js in lib directory
        createIndexFile(path.join(targetProjectPath, 'index.js'));
        createIndexFile(path.join(targetActionPath, 'index.js'));
      }
    });
  }
  
  // Verify that the patches worked
  console.log('\nVerifying patch installation:');
  const pathsToCheck = [
    path.join(__dirname, '[project]/node_modules/uglify-js/lib/utils.js'),
    path.join(__dirname, '(action-browser)/node_modules/uglify-js/lib/utils.js'),
    path.join(__dirname, '[project]/node_modules/mjml/index.js'),
    path.join(__dirname, '(action-browser)/node_modules/mjml/index.js')
  ];
  
  pathsToCheck.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      console.log(`✓ ${filePath} exists`);
    } else {
      console.error(`✗ ${filePath} is missing!`);
    }
  });
  
  console.log('\nPatch completed successfully');
} catch (error) {
  console.error('Error during patching:', error);
}

// Helper function to copy entire directories
function copyFolderRecursiveSync(source, target) {
  // Check if folder needs to be created or integrated
  const targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Copy
  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach(function(file) {
      const curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

function copyFileSync(source, target) {
  const targetFile = path.join(target, path.basename(source));
  // Don't try to copy if target file already exists and is same size
  if (fs.existsSync(targetFile) && 
      fs.statSync(source).size === fs.statSync(targetFile).size) {
    return;
  }
  
  try {
    fs.writeFileSync(targetFile, fs.readFileSync(source));
  } catch (err) {
    console.error(`Error copying file ${source} to ${targetFile}:`, err);
  }
}
