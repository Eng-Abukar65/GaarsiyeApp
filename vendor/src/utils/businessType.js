const normalizeBusinessType = (value) => String(value || '').trim().toLowerCase();

export const resolveBusinessTypes = (vendor, user) => {
  const candidates = [
    vendor?.business_types,
    user?.business_types,
    vendor?.business_type,
    user?.business_type,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.filter(Boolean);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      return [candidate.trim()];
    }
  }

  return [];
};

export const hasBusinessType = (businessTypes, target) => {
  const normalizedTarget = normalizeBusinessType(target);
  return (businessTypes || []).some((type) => normalizeBusinessType(type) === normalizedTarget);
};

export const getBusinessMode = (businessTypes) => {
  if (hasBusinessType(businessTypes, 'Car Services') || hasBusinessType(businessTypes, 'Car Wash')) return 'car_wash';
  if (hasBusinessType(businessTypes, 'Spare Parts Shop')) return 'spare_parts';
  if (hasBusinessType(businessTypes, 'Gas Depot')) return 'gas_depot';
  if (hasBusinessType(businessTypes, 'Petrol Station')) return 'petrol_station';
  return 'vendor';
};

