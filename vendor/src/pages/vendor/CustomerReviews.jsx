import React, { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';

const emptySummary = {
  average_rating: 0,
  total_reviews: 0,
  positive_reviews: 0,
  distribution: [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: 0,
    percentage: 0,
  })),
};

const ratingFilters = ['All', '5', '4', '3', '2', '1'];

const formatDate = (value) => {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const initialsFor = (name = 'Customer') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CU';

const Stars = ({ rating, size = 'text-lg' }) => (
  <div className={`flex text-primary ${size}`} aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <span
        key={star}
        className={`material-symbols-outlined ${star <= Math.round(rating) ? 'fill-icon' : ''}`}
        data-icon="star"
      >
        {star <= Math.round(rating) ? 'star' : 'star_border'}
      </span>
    ))}
  </div>
);

const CustomerReviews = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [selectedRating, setSelectedRating] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchReviews = async () => {
    if (!user || !user.id) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/vendor/reviews?vendorId=${user.id}`);
      setReviews(response.data?.reviews || []);
      setSummary(response.data?.summary || emptySummary);
    } catch (err) {
      console.error('Failed to fetch vendor reviews', err);
      setError(err.response?.data?.message || 'Failed to load reviews.');
      setReviews([]);
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.id) {
      fetchReviews();
    } else {
      setLoading(false);
    }
  }, []);

  const filteredReviews = useMemo(() => {
    if (selectedRating === 'All') return reviews;
    return reviews.filter((review) => Number(review.rating) === Number(selectedRating));
  }, [reviews, selectedRating]);

  const handleExport = () => {
    if (filteredReviews.length === 0) {
      setMessage('There are no reviews to export.');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const rows = [
      ['Order ID', 'Customer', 'Rating', 'Comment', 'Created At'],
      ...filteredReviews.map((review) => [
        review.order_id ? `#${review.order_id}` : '',
        review.customer_name || 'Customer',
        review.rating,
        review.comment || '',
        review.created_at || '',
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor-reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setMessage('Reviews report exported.');
    setTimeout(() => setMessage(''), 3000);
  };

  const distribution = summary.distribution?.length
    ? summary.distribution
    : emptySummary.distribution;

  if (!user || !user.id) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔐</div>
          <h2 className="text-xl font-bold text-red-700 mb-2">Authentication Required</h2>
          <p className="text-red-600 mb-4">Please log in to view customer reviews.</p>
          <button onClick={() => window.location.href = '/login'} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700">Go to Login</button>
        </div>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-yellow-700 mb-2">Error Loading Reviews</h2>
          <p className="text-yellow-600 mb-4">{error}</p>
          <button onClick={fetchReviews} className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4">
      <section className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-surface-container-lowest p-8 rounded-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 border border-outline-variant/10 shadow-sm">
            <div>
              <h2 className="text-on-surface-variant font-medium mb-1">Overall Satisfaction</h2>
              <div className="flex items-baseline gap-4">
                <span className="text-6xl font-extrabold font-headline text-on-surface tracking-tight">
                  {Number(summary.average_rating || 0).toFixed(1)}
                </span>
                <div className="flex flex-col">
                  <Stars rating={summary.average_rating || 0} />
                  <span className="text-sm text-on-surface-variant">
                    Based on {Number(summary.total_reviews || 0).toLocaleString()} reviews
                  </span>
                </div>
              </div>
            </div>
            <div className="w-full lg:w-48 space-y-2">
              {distribution.map((row) => (
                <div key={row.rating} className="flex items-center gap-2 text-xs">
                  <span className="w-4">{row.rating}</span>
                  <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${row.percentage || 0}%` }} />
                  </div>
                  <span className="text-on-surface-variant w-10 text-right">{row.percentage || 0}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary-container p-8 rounded-xl flex flex-col justify-between border border-primary/10 shadow-sm">
            <div>
              <span className="material-symbols-outlined text-on-primary-container text-4xl mb-4" data-icon="rate_review">
                rate_review
              </span>
              <h3 className="text-on-primary-container font-bold text-xl font-headline">Review Signals</h3>
            </div>
            <p className="text-on-primary-container/80 text-sm">
              {summary.total_reviews > 0
                ? `${summary.positive_reviews} reviews are rated 4 stars or higher.`
                : 'No customer reviews have been submitted yet.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            {message && <span className="text-xs font-bold text-primary mr-4">{message}</span>}
            {ratingFilters.map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedRating(filter)}
                className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  selectedRating === filter
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                }`}
              >
                {filter === 'All' ? 'All Reviews' : `${filter} Stars`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 text-sm font-semibold text-primary px-4 py-2 border border-primary/20 rounded-lg hover:bg-primary/5 transition-all bg-white shadow-sm"
            >
              <span className="material-symbols-outlined text-lg" data-icon="ios_share">ios_share</span>
              Export Report
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm text-center">
              <p className="text-on-surface-variant font-bold tracking-widest uppercase opacity-60 py-8">Loading reviews...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 rounded-xl p-6 border border-red-100 text-red-700 font-semibold">
              {error}
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm text-center">
              <p className="text-on-surface-variant font-bold tracking-widest uppercase opacity-50 py-8">
                No customer reviews found
              </p>
            </div>
          ) : (
            filteredReviews.map((review) => (
              <article
                key={`${review.source}-${review.id}`}
                className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-11 w-11 rounded-full bg-primary-container text-primary font-bold flex items-center justify-center">
                      {initialsFor(review.customer_name)}
                    </div>
                    <div>
                      <h3 className="font-bold text-on-surface">{review.customer_name || 'Customer'}</h3>
                      <p className="text-xs text-on-surface-variant">
                        {review.order_id ? `Order #${review.order_id}` : 'Vendor review'} - {formatDate(review.created_at)}
                      </p>
                      <p className="text-sm text-on-surface-variant mt-3">
                        {review.comment || 'No written comment was provided.'}
                      </p>
                    </div>
                  </div>
                  <Stars rating={review.rating || 0} size="text-base" />
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default CustomerReviews;
