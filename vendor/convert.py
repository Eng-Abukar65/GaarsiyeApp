import os
import re

design_dir = "Vendor_design"
pages_dir = "src/pages"

os.makedirs(pages_dir, exist_ok=True)

def camel_case_attrs(match):
    tag = match.group(0)
    # replace common SVG and HTML attributes
    tag = tag.replace('class=', 'className=')
    tag = tag.replace('for=', 'htmlFor=')
    tag = tag.replace('tabindex=', 'tabIndex=')
    tag = tag.replace('fill-rule=', 'fillRule=')
    tag = tag.replace('clip-rule=', 'clipRule=')
    tag = tag.replace('stroke-linecap=', 'strokeLinecap=')
    tag = tag.replace('stroke-linejoin=', 'strokeLinejoin=')
    tag = tag.replace('stroke-width=', 'strokeWidth=')
    tag = tag.replace('autocomplete=', 'autoComplete=')
    tag = tag.replace('autofocus=', 'autoFocus=')
    tag = tag.replace('readonly=', 'readOnly=')
    tag = re.sub(r'style="[^"]*"', '', tag) # remove inline styles
    return tag

routes = []
imports = []

folders = [f for f in os.listdir(design_dir) if os.path.isdir(os.path.join(design_dir, f))]

for folder in folders:
    folder_path = os.path.join(design_dir, folder)
    
    html_file = os.path.join(folder_path, "code.html")
    if not os.path.exists(html_file):
        continue
        
    with open(html_file, 'r', encoding='utf-8') as f:
        html = f.read()
        
    # Extract body content
    match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if match:
        body_content = match.group(1)
    else:
        body_content = html
        
    # Remove script tags
    body_content = re.sub(r'<script.*?</script>', '', body_content, flags=re.DOTALL | re.IGNORECASE)
    
    # Process opening tags to change attributes
    body_content = re.sub(r'<[a-zA-Z][^>]*>', camel_case_attrs, body_content)
    
    # Self-close specific tags
    body_content = re.sub(r'<(img|input|hr|br|path|ellipse|circle|rect|line|polygon|polyline)([^>]*?)(?<!/)>', r'<\1\2 />', body_content, flags=re.IGNORECASE)
    
    # Fix instances where tags might now look like <img ... / /> if they were already closed
    body_content = re.sub(r'/\s*/>', '/>', body_content)
    
    # HTML comments to JSX comments
    body_content = re.sub(r'<!--(.*?)-->', r'{/* \1 */}', body_content, flags=re.DOTALL)
    
    # Map component name
    comp_name = "".join(word.capitalize() for word in folder.split('_'))
    
    # Wrap in component
    jsx = f"""import React from 'react';

const {comp_name} = () => {{
  return (
    <>
      {body_content}
    </>
  );
}};

export default {comp_name};
"""
    jsx_file = os.path.join(pages_dir, f"{comp_name}.jsx")
    with open(jsx_file, 'w', encoding='utf-8') as f:
        f.write(jsx)
        
    imports.append(f"import {comp_name} from './pages/{comp_name}';")
    routes.append(f"        <Route path='/{folder}' element={{<{comp_name} />}} />")

app_jsx = f"""import React from 'react';
import {{ BrowserRouter as Router, Routes, Route, Link }} from 'react-router-dom';

{chr(10).join(imports)}

function App() {{
  return (
    <Router>
      <div>
        <nav style={{padding: '10px', background: '#ccc', display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
{chr(10).join([f"          <Link to='/{f}'>{f}</Link>" for f in folders])}
        </nav>
        <Routes>
          <Route path="/" element={{<div>Select a prototype page from above</div>}} />
{chr(10).join(routes)}
        </Routes>
      </div>
    </Router>
  );
}}

export default App;
"""

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(app_jsx)
