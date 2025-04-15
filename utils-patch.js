// This file serves as a patch for the missing utils.js in uglify-js
const fs = require('fs');
const path = require('path');

try {
  // Define the paths
  const uglifyJsPath = path.resolve(__dirname, 'node_modules', 'uglify-js');
  const utilsPath = path.join(uglifyJsPath, 'lib', 'utils.js');
  
  // Create the [project] folder structure if it doesn't exist
  const projectPath = path.resolve(__dirname, '[project]', 'node_modules', 'uglify-js', 'lib');
  
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
    console.log('Created directory structure:', projectPath);
  }
  
  // Copy the utils.js file if it exists
  if (fs.existsSync(utilsPath)) {
    fs.copyFileSync(utilsPath, path.join(projectPath, 'utils.js'));
    console.log('Copied utils.js to:', path.join(projectPath, 'utils.js'));
  } else {
    console.error('Source utils.js not found at:', utilsPath);
  }
  
  // Create the (action-browser) folder structure if it doesn't exist
  const actionBrowserPath = path.resolve(__dirname, '(action-browser)', 'node_modules', 'uglify-js', 'lib');
  
  if (!fs.existsSync(actionBrowserPath)) {
    fs.mkdirSync(actionBrowserPath, { recursive: true });
    console.log('Created directory structure:', actionBrowserPath);
  }
  
  // Copy the utils.js file to action-browser path
  if (fs.existsSync(utilsPath)) {
    fs.copyFileSync(utilsPath, path.join(actionBrowserPath, 'utils.js'));
    console.log('Copied utils.js to:', path.join(actionBrowserPath, 'utils.js'));
  }
  
  console.log('Patch completed successfully');
} catch (error) {
  console.error('Error during patching:', error);
}
