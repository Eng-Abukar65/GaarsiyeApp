const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, 'src');

const replacements = {
  'bg-slate-900': 'bg-white dark:bg-slate-900',
  'bg-slate-950': 'bg-slate-50 dark:bg-slate-950',
  'bg-dark-950': 'bg-slate-100 dark:bg-dark-950',
  'bg-slate-800': 'bg-slate-50 dark:bg-slate-800',
  'border-slate-800': 'border-slate-200 dark:border-slate-800',
  'border-slate-700': 'border-slate-300 dark:border-slate-700',
  'text-white': 'text-slate-900 dark:text-white',
  'text-slate-200': 'text-slate-800 dark:text-slate-200',
  'text-slate-300': 'text-slate-700 dark:text-slate-300',
  'text-slate-400': 'text-slate-600 dark:text-slate-400',
  'text-slate-500': 'text-slate-500 dark:text-slate-400', // slate-500 is ok but wait
  'bg-slate-800/50': 'bg-slate-100 dark:bg-slate-800/50',
  'bg-slate-900/40': 'bg-white dark:bg-slate-900/40',
  'bg-slate-900/20': 'bg-slate-50 dark:bg-slate-900/20',
  'bg-slate-900/50': 'bg-slate-50 dark:bg-slate-900/50',
  'border-slate-800/40': 'border-slate-200 dark:border-slate-800/40',
  'border-slate-800/60': 'border-slate-200 dark:border-slate-800/60',
  'border-slate-800/80': 'border-slate-200 dark:border-slate-800/80',
  'border-slate-700/50': 'border-slate-300 dark:border-slate-700/50',
  'hover:bg-slate-800/20': 'hover:bg-slate-50 dark:hover:bg-slate-800/20',
  'hover:bg-slate-800/50': 'hover:bg-slate-100 dark:hover:bg-slate-800/50',
  'hover:bg-slate-800': 'hover:bg-slate-100 dark:hover:bg-slate-800',
  'hover:text-white': 'hover:text-slate-900 dark:hover:text-white',
  'divide-slate-800/20': 'divide-slate-200 dark:divide-slate-800/20',
  'divide-slate-800/40': 'divide-slate-200 dark:divide-slate-800/40'
};

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      // Prevent double replacement if script is run twice
      if (content.includes('dark:bg-slate-900')) continue;

      for (const [key, value] of Object.entries(replacements)) {
        // Regex to match exact tailwind class word boundaries
        // Using (?<!dark:) to prevent matching already prefixed ones
        const regex = new RegExp(`(?<!dark:|-)(?<![\\w])(${key})(?![\\w\\/-])`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, value);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(directory);
