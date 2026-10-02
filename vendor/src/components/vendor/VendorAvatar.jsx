import React, { useState } from 'react';
import { getVendorInitials, getVendorLogoUrl } from '../../utils/vendorIdentity';

const sizeClasses = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-14 h-14 text-sm',
  lg: 'w-20 h-20 text-lg',
};

const VendorAvatar = ({ vendor, size = 'sm', className = '', rounded = 'rounded-full' }) => {
  const [failedUrl, setFailedUrl] = useState('');
  const logoUrl = getVendorLogoUrl(vendor);
  const shouldShowLogo = logoUrl && failedUrl !== logoUrl;

  const baseClass = `${sizeClasses[size] || sizeClasses.sm} ${rounded} overflow-hidden border border-outline-variant/20 bg-primary-container text-primary font-black flex items-center justify-center shrink-0 ${className}`;

  if (shouldShowLogo) {
    return (
      <div className={baseClass}>
        <img
          src={logoUrl}
          alt={`${vendor?.business_name || vendor?.name || 'Vendor'} logo`}
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(logoUrl)}
        />
      </div>
    );
  }

  return (
    <div className={baseClass} aria-label="Default vendor avatar">
      {getVendorInitials(vendor)}
    </div>
  );
};

export default VendorAvatar;
