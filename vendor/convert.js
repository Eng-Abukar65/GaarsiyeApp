const fs = require('fs');
const path = require('path');

const designDir = 'Vendor_design';
const pagesDir = 'src/pages';

if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
}

function camelCaseAttrs(match) {
    let tag = match;
    tag = tag.replace(/class=/g, 'className=');
    tag = tag.replace(/for=/g, 'htmlFor=');
    tag = tag.replace(/tabindex=/g, 'tabIndex=');
    tag = tag.replace(/fill-rule=/g, 'fillRule=');
    tag = tag.replace(/clip-rule=/g, 'clipRule=');
    tag = tag.replace(/stroke-linecap=/g, 'strokeLinecap=');
    tag = tag.replace(/stroke-linejoin=/g, 'strokeLinejoin=');
    tag = tag.replace(/stroke-width=/g, 'strokeWidth=');
    tag = tag.replace(/autocomplete=/ig, 'autoComplete=');
    tag = tag.replace(/autofocus=/ig, 'autoFocus=');
    tag = tag.replace(/readonly=/ig, 'readOnly=');
    tag = tag.replace(/style="[^"]*"/g, ''); // Remove inline styles
    return tag;
}

const routes = [];
const imports = [];

const folders = fs.readdirSync(designDir).filter(f => fs.statSync(path.join(designDir, f)).isDirectory());

folders.forEach(folder => {
    const htmlFile = path.join(designDir, folder, 'code.html');
    if (!fs.existsSync(htmlFile)) return;

    let html = fs.readFileSync(htmlFile, 'utf8');

    // Extract body content
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyContent = match ? match[1] : html;

    // Remove scripts
    bodyContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Replace attributes
    bodyContent = bodyContent.replace(/<[a-zA-Z][^>]*>/g, camelCaseAttrs);

    // Self close tags
    ['img', 'input', 'hr', 'br', 'path', 'ellipse', 'circle', 'rect', 'line', 'polygon', 'polyline'].forEach(tag => {
        const regex = new RegExp(`(<${tag}[^>]*?)(?<!/)>`, 'gi');
        bodyContent = bodyContent.replace(regex, '$1 />');
    });

    bodyContent = bodyContent.replace(/\/\s*\/>/g, '/>');

    // Comments
    bodyContent = bodyContent.replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}');

    const compName = folder.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

    const jsx = `import React from 'react';\n\nconst ${compName} = () => {\n  return (\n    <>\n      ${bodyContent}\n    </>\n  );\n};\n\nexport default ${compName};\n`;

    fs.writeFileSync(path.join(pagesDir, `${compName}.jsx`), jsx);

    imports.push(`import ${compName} from './pages/${compName}';`);
    routes.push(`        <Route path='/${folder}' element={<${compName} />} />`);
});

const appJsx = `import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

${imports.join('\n')}

function App() {
  return (
    <Router>
      <div>
        <nav style={{padding: '10px', background: '#ccc', display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
${folders.map(f => `          <Link to='/${f}'>${f}</Link>`).join('\n')}
        </nav>
        <Routes>
          <Route path="/" element={<div>Select a prototype page from above</div>} />
${routes.join('\n')}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
`;

fs.writeFileSync('src/App.jsx', appJsx);
