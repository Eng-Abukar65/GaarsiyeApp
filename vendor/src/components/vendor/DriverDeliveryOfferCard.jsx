import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../../utils/api';
import { getToken } from '../../utils/auth';

/**
 * DriverDeliveryOfferCard
 *
 * Implements the "SELECT AVAILABLE DRIVER" section with "Driver Delivery Earning" input,
 * real-time validation, automatic driver list polling (15s), green online indicators,
 * empty state handling, and offer status cards.
 */
const DriverDeliveryOfferCard = ({
  orderId,
  order,
  onOfferSent,
  onCancel,
  onRefreshOrder,
}) => {
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [fetchingDrivers, setFetchingDrivers] = useState(true);
  const [driverLoadError, setDriverLoadError] = useState('');
  const latestDriverRequest = useRef(0);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [earningAmount, setEarningAmount] = useState('1.00');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [offerData, setOfferData] = useState(null);
  const [loadingOffer, setLoadingOffer] = useState(false);

  // Fetch available drivers from backend
  const fetchAvailableDrivers = useCallback(async () => {
    const requestId = ++latestDriverRequest.current;
    try {
      setFetchingDrivers(true);
      const res = await api.get('/vendor/drivers/available');
      const list = res.data?.drivers || (Array.isArray(res.data) ? res.data : []);
      if (requestId !== latestDriverRequest.current) return;
      const freshDrivers = Array.isArray(list) ? list : [];
      setAvailableDrivers(freshDrivers);
      setSelectedDriverId((currentId) => (
        freshDrivers.some((driver) => String(driver.id) === String(currentId))
          ? currentId
          : ''
      ));
      setDriverLoadError('');
    } catch (err) {
      if (requestId !== latestDriverRequest.current) return;
      setAvailableDrivers([]);
      setSelectedDriverId('');
      setDriverLoadError(
        err.response?.data?.message || 'Could not refresh online drivers. Please try again.',
      );
    } finally {
      if (requestId === latestDriverRequest.current) setFetchingDrivers(false);
    }
  }, []);

  // Poll available drivers every 15 seconds
  useEffect(() => {
    fetchAvailableDrivers();
    const timer = setInterval(() => {
      fetchAvailableDrivers();
    }, 15000);
    return () => {
      clearInterval(timer);
      latestDriverRequest.current += 1;
    };
  }, [fetchAvailableDrivers]);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });
    const refresh = () => fetchAvailableDrivers();
    socket.on('driver-online-status', refresh);
    socket.on('driver-availability-updated', refresh);
    socket.on('offer-accepted', refresh);
    socket.on('offer-declined', refresh);
    socket.on('delivery-status-updated', refresh);
    return () => socket.disconnect();
  }, [fetchAvailableDrivers]);

  // Fetch current offer details if any exist for this order
  const fetchOffer = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoadingOffer(true);
      const res = await api.get(`/vendor/orders/${orderId}/offer`);
      if (res.data?.success && res.data?.offer) {
        setOfferData(res.data.offer);
        if (res.data.offer.offered_amount) {
          setEarningAmount(String(res.data.offer.offered_amount));
        }
      }
    } catch {
      // non-blocking
    } finally {
      setLoadingOffer(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  // Handle amount change with strict regex: digits + max 1 dot + max 2 decimals
  const handleAmountChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts[1] && parts[1].length > 2) {
      val = parts[0] + '.' + parts[1].slice(0, 2);
    }
    setEarningAmount(val);
    setError('');
  };

  // Validation logic
  const getValidationMessage = () => {
    if (availableDrivers.length === 0) return 'No online drivers are currently available.';
    const selectedIsAvailable = availableDrivers.some(
      (driver) => String(driver.id) === String(selectedDriverId),
    );
    if (!selectedDriverId || !selectedIsAvailable) return 'Please select a driver.';
    if (!earningAmount || earningAmount.trim() === '') return 'Please enter driver delivery earning amount.';
    const num = Number(earningAmount);
    if (isNaN(num) || num <= 0) return 'Earning amount must be greater than $0.00.';
    if (!/^\d+(\.\d{1,2})?$/.test(earningAmount.trim())) return 'Maximum 2 decimal places allowed.';
    return null;
  };

  const handleSendOffer = async () => {
    const valErr = getValidationMessage();
    if (valErr) {
      setError(valErr);
      return;
    }

    try {
      setSending(true);
      setError('');
      const res = await api.post(`/vendor/orders/${orderId}/send-offer`, {
        driverId: selectedDriverId,
        offeredAmount: earningAmount,
      });

      if (res.data?.success) {
        if (onOfferSent) {
          onOfferSent(res.data.message || `Delivery offer sent successfully for $${Number(earningAmount).toFixed(2)}.`);
        }
        await fetchOffer();
        await fetchAvailableDrivers();
        if (onRefreshOrder) onRefreshOrder();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send delivery offer.';
      setError(msg);
      setSelectedDriverId('');
      await fetchAvailableDrivers();
    } finally {
      setSending(false);
    }
  };

  // Find selected driver object
  const selectedDriver = availableDrivers.find((d) => String(d.id) === String(selectedDriverId));
  const driverDisplayName = selectedDriver
    ? (selectedDriver.full_name || `${selectedDriver.first_name} ${selectedDriver.last_name}`)
    : (order?.driver_first_name
        ? `${order.driver_first_name} ${order.driver_last_name}`
        : 'Selected driver');

  const numAmount = Number(earningAmount);
  const formattedAmount = (!isNaN(numAmount) && numAmount > 0)
    ? `$${numAmount.toFixed(2)}`
    : `$${earningAmount || '0.00'}`;

  // Check state
  const isAssigned =
    order?.driver_assignment_status === 'driver_assigned' ||
    (order?.status || '').toLowerCase() === 'driver assigned' ||
    offerData?.status === 'accepted';

  const isOfferPending =
    offerData?.status === 'pending' ||
    order?.driver_assignment_status === 'offer_sent';

  const isOfferDeclined = offerData?.status === 'declined';

  if (loadingOffer) {
    return (
      <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 text-center animate-pulse">
        <p className="text-xs font-bold text-purple-700">Loading delivery offer status…</p>
      </div>
    );
  }

  // 1. DRIVER ASSIGNED STATE
  if (isAssigned) {
    const assignedName =
      (order?.driver_first_name ? `${order.driver_first_name} ${order.driver_last_name}` : null) ||
      (offerData?.first_name ? `${offerData.first_name} ${offerData.last_name}` : driverDisplayName);
    const vehicle = order?.driver_vehicle || offerData?.vehicle_type || selectedDriver?.vehicle_type || 'Vehicle';
    const earning = order?.driver_earning || offerData?.offered_amount || earningAmount;

    return (
      <div className="p-5 bg-purple-50/90 rounded-2xl border-2 border-purple-400 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-purple-900 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-purple-700 text-base">verified</span>
            DRIVER ASSIGNED
          </p>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase">
            Accepted
          </span>
        </div>
        <div className="text-sm space-y-1.5 text-purple-950 font-semibold pt-1">
          <p className="font-extrabold text-base text-purple-900">{assignedName}</p>
          <p className="text-xs text-purple-800">Vehicle: <span className="font-bold">{vehicle}</span></p>
          <p className="text-xs text-purple-800">
            Driver earning: <span className="font-extrabold text-green-700">${Number(earning || 0).toFixed(2)}</span>
          </p>
          <p className="text-xs text-purple-700 italic pt-1">Offer status: Accepted</p>
        </div>
      </div>
    );
  }

  // 2. OFFER PENDING STATE
  if (isOfferPending) {
    const pendingName = offerData
      ? `${offerData.first_name} ${offerData.last_name}`
      : driverDisplayName;
    const pendingEarning = offerData?.offered_amount || order?.driver_earning || earningAmount;

    return (
      <div className="p-5 bg-purple-50/90 rounded-2xl border-2 border-purple-400 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-purple-900 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-purple-700 text-base">outbox</span>
            DELIVERY OFFER SENT
          </p>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase animate-pulse">
            Offer Sent
          </span>
        </div>

        <p className="text-sm font-bold text-purple-950">
          Delivery offer sent to <span className="text-purple-900 font-extrabold">{pendingName}</span> for{' '}
          <span className="text-green-700 font-extrabold">${Number(pendingEarning || 0).toFixed(2)}</span>.
        </p>

        <p className="text-xs text-purple-700 font-medium">
          {pendingName} will receive notification to accept or decline this delivery.
        </p>

        <div className="pt-2 flex items-center gap-2">
          <button
            onClick={async () => {
              setOfferData(null);
              await fetchAvailableDrivers();
              if (onRefreshOrder) onRefreshOrder();
            }}
            className="px-3 py-2 bg-white border border-purple-300 text-purple-800 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors"
          >
            Re-send or Change Driver
          </button>
        </div>
      </div>
    );
  }

  // 3. OFFER FORM (DEFAULT & DECLINED RE-TRY)
  return (
    <div className="p-5 bg-purple-50/90 rounded-2xl border-2 border-purple-400 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold text-purple-900 uppercase tracking-widest flex items-center gap-1.5">
          <span className="material-symbols-outlined text-purple-700 text-base">person_add</span>
          SELECT AVAILABLE DRIVER
        </p>
        {fetchingDrivers && (
          <span className="text-[10px] font-bold text-purple-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs animate-spin">sync</span>
            Updating drivers…
          </span>
        )}
      </div>

      {/* Decline notice if previously declined */}
      {isOfferDeclined && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">info</span>
          <span>{offerData?.first_name || 'Driver'} declined the delivery offer. You can select another driver.</span>
        </div>
      )}

      {/* Empty State Warning */}
      {driverLoadError && !fetchingDrivers && (
        <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">cloud_off</span>
          <span>{driverLoadError}</span>
        </div>
      )}
      {!driverLoadError && availableDrivers.length === 0 && !fetchingDrivers && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-amber-700">warning</span>
          <span>No online drivers are currently available.</span>
        </div>
      )}

      {/* Driver Selection Dropdown */}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-purple-900 uppercase tracking-wider block">
          Driver
        </label>
        <select
          value={selectedDriverId}
          onChange={(e) => {
            setSelectedDriverId(e.target.value);
            setError('');
          }}
          disabled={availableDrivers.length === 0}
          className="w-full bg-white px-4 py-3 rounded-xl border border-purple-300 focus:ring-2 focus:ring-purple-600 outline-none text-sm font-bold text-purple-950 shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">
            {availableDrivers.length === 0 ? 'No online drivers available' : 'Select a driver...'}
          </option>
          {availableDrivers.map((d) => {
            const name = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || `Driver #${d.id}`;
            const vehicle = d.vehicle_type || 'Vehicle';
            return (
              <option key={d.id} value={d.id}>
                🟢 {name} ({vehicle})
              </option>
            );
          })}
        </select>
      </div>

      {/* Driver Delivery Earning Amount Input */}
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-purple-900 uppercase tracking-wider block">
          Driver Delivery Earning
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-4 text-purple-700 font-extrabold text-sm">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={earningAmount}
            onChange={handleAmountChange}
            placeholder="1.00"
            className="w-full bg-white pl-8 pr-4 py-3 rounded-xl border border-purple-300 focus:ring-2 focus:ring-purple-600 outline-none text-sm font-bold text-purple-950 shadow-sm"
          />
        </div>
      </div>

      {/* Confirmation helper message */}
      <p className="text-xs font-semibold text-purple-900 leading-relaxed">
        {driverDisplayName} will receive {formattedAmount} after successfully completing this delivery.
      </p>

      {/* Inline validation error message */}
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs font-bold text-red-800 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSendOffer}
          disabled={sending || availableDrivers.length === 0 || Boolean(getValidationMessage())}
          className="flex-1 px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
              Sending Offer…
            </>
          ) : (
            'Send Offer to Driver'
          )}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default DriverDeliveryOfferCard;
