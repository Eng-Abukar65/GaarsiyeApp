import React from 'react';
import { Eye, Download } from 'lucide-react';
import { API_URL } from '../utils/api';

const SecureDocumentLink = ({ path, vendorId, label, className = '' }) => {
  if (!path) return <span className="text-slate-400 font-normal">N/A</span>;

  const fileName = String(path).split('/').pop() || 'Document';
  const token = localStorage.getItem('admin_token') || '';

  const baseUrl = (API_URL || 'http://localhost:5001/api').replace(/\/+$/, '');
  const params = new URLSearchParams({ path });
  if (vendorId) params.append('vendorId', vendorId);
  if (token) params.append('token', token);

  const viewUrl = `${baseUrl}/documents/preview?${params.toString()}`;
  const downloadUrl = `${baseUrl}/documents/download?${params.toString()}`;

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {/* View Document Button */}
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`View ${fileName} in a new tab`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 dark:text-primary-300 font-bold text-xs rounded-xl transition-all border border-primary-200 dark:border-primary-800"
      >
        <Eye size={14} />
        <span>View Document</span>
      </a>

      {/* Download Button */}
      <a
        href={downloadUrl}
        download
        title={`Download ${fileName}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all border border-slate-200 dark:border-slate-700"
      >
        <Download size={14} />
        <span>Download</span>
      </a>

      <span className="text-[11px] font-medium text-slate-400 truncate max-w-[160px]" title={fileName}>
        ({fileName})
      </span>
    </div>
  );
};

export default SecureDocumentLink;
