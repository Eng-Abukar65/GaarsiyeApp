import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, 'src', 'pages');

const filesToSkip = ['DashboardOverview.jsx', 'Login.jsx'];

fs.readdirSync(pagesDir).forEach(file => {
  if (file.endsWith('.jsx') && !filesToSkip.includes(file)) {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove aside
    content = content.replace(/<aside[\s\S]*?<\/aside>/, '');
    
    // Remove header
    content = content.replace(/<header[\s\S]*?<\/header>/, '');
    
    // Replace main with standard wrapper container
    content = content.replace(/<main[^>]*>/, '<div className="max-w-[1400px] mx-auto w-full pb-12">');
    content = content.replace(/<\/main>/, '</div>');

    // Remove old comments
    content = content.replace(/{\/\*[\s\S]*?Component[\s\S]*?\*\/}/gi, '');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Processed ${file}`);
  }
});
