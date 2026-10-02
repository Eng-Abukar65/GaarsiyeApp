import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

// ─── Payment State Machine ─────────────────────────────────────────────────────
//
// Success path:
//   idle → sending → awaitingApproval → verifying → creatingOrder → completed
//
// Failure path (payment rejected):
//   idle → sending → awaitingApproval → failed      (stops here)
//
// Cancellation path (customer declined on phone):
//   idle → sending → awaitingApproval → cancelled   (stops here)
//
// Timeout path (no confirmation in time):
//   idle → sending → awaitingApproval → timedOut    (stops here)
//
// Network/server error path:
//   idle → sending → failed                         (stops at sending)
//
// Each enum value maps to a specific visible progress step so the error icon
// always lands on the step where the failure actually happened — never on a
// later step that was never reached.

/// All stages the backend may report for an async checkout.
/// Mirrors `CheckoutService.STAGES` in checkoutService.js.
enum CheckoutStage {
  // ── In-progress ──────────────────────────────────────────
  sending,           // sending → awaiting_approval
  awaitingApproval,  // customer must approve on phone
  verifying,         // provider confirmed, server verifying
  creatingOrder,     // payment verified, creating DB order

  // ── Terminal: success ─────────────────────────────────────
  completed,         // order exists in DB ✓

  // ── Terminal: failures ────────────────────────────────────
  // Each failure stage encodes WHERE in the flow it happened so the UI can
  // mark the correct step with ❌ and leave subsequent steps as ○.
  failed,            // failed during / after verifying (payment rejected)
  cancelled,         // customer cancelled the payment prompt
  timedOut,          // no response within timeout window
}

/// Converts the raw string returned by the backend into a [CheckoutStage].
CheckoutStage checkoutStageFrom(String? raw) {
  switch (raw) {
    case 'sending':
      return CheckoutStage.sending;
    case 'awaiting_approval':
      return CheckoutStage.awaitingApproval;
    case 'verifying':
      return CheckoutStage.verifying;
    case 'creating_order':
      return CheckoutStage.creatingOrder;
    case 'completed':
      return CheckoutStage.completed;
    case 'cancelled':
      return CheckoutStage.cancelled;
    case 'timed_out':
      return CheckoutStage.timedOut;
    default:
      // 'failed' and any unknown value → payment verification failed
      return CheckoutStage.failed;
  }
}

// ─── Step list (success-path display order) ────────────────────────────────────
//
// These are the steps the UI always shows. Each step is tied to ONE in-progress
// stage. Failure stages are mapped to the step index where they halted via
// [_failureStepIndex] below.

class _Step {
  final CheckoutStage stage;
  final String label;
  final String hint;
  const _Step(this.stage, this.label, this.hint);
}

const List<_Step> _steps = <_Step>[
  _Step(
    CheckoutStage.sending,
    'Sending payment request',
    'Contacting your mobile wallet…',
  ),
  _Step(
    CheckoutStage.awaitingApproval,
    'Waiting for customer approval',
    'Check your phone and tap Approve / OK.',
  ),
  _Step(
    CheckoutStage.verifying,
    'Verifying payment',
    'Confirming with the payment provider…',
  ),
  _Step(
    CheckoutStage.creatingOrder,
    'Creating your order',
    'Payment verified — saving your order…',
  ),
  _Step(
    CheckoutStage.completed,
    'Order completed',
    'Taking you to your receipt…',
  ),
];

/// Returns the step index (into [_steps]) at which the given failure stage
/// should display its ❌ icon. Steps AFTER this index remain ○ (pending).
///
/// Rules:
/// • [CheckoutStage.failed]    → failed during / after verification  → step 2 (Verifying payment)
/// • [CheckoutStage.cancelled] → customer declined on phone           → step 1 (Waiting for approval)
/// • [CheckoutStage.timedOut]  → no confirmation received            → step 1 (Waiting for approval)
///
/// Any other stage is not a failure and should not call this function.
int _failureStepIndex(CheckoutStage stage) {
  switch (stage) {
    case CheckoutStage.cancelled:
    case CheckoutStage.timedOut:
      return 1; // failed at "Waiting for customer approval"
    case CheckoutStage.failed:
    default:
      return 2; // failed at "Verifying payment"
  }
}

/// Returns the index of the active in-progress step for a non-failure stage.
int _progressStepIndex(CheckoutStage stage) {
  final i = _steps.indexWhere((s) => s.stage == stage);
  // completed → all steps done; treat as beyond the last index
  if (stage == CheckoutStage.completed) return _steps.length;
  if (i != -1) return i;
  return 0;
}

// ─── Widget ────────────────────────────────────────────────────────────────────

/// Replaces the indefinite spinner with a live step-by-step checklist so the
/// customer always knows exactly where their payment is, and never sees a
/// contradictory state like "Order completed" when payment failed.
class CheckoutProgressView extends StatelessWidget {
  final CheckoutStage stage;

  /// Human-readable reason shown when [stage] is a failure stage.
  final String? failReason;

  /// Whether a fresh retry is safe (only true when we know nothing was charged).
  final bool canRetry;

  final VoidCallback? onRetry;
  final VoidCallback? onCheckStatus;
  final VoidCallback? onCancel;

  const CheckoutProgressView({
    super.key,
    required this.stage,
    this.failReason,
    this.canRetry = false,
    this.onRetry,
    this.onCheckStatus,
    this.onCancel,
  });

  // ── Computed properties ────────────────────────────────────────────────────

  bool get _isFailure =>
      stage == CheckoutStage.failed ||
      stage == CheckoutStage.cancelled ||
      stage == CheckoutStage.timedOut;

  bool get _isSuccess => stage == CheckoutStage.completed;

  /// The step index where ❌ appears (only meaningful when [_isFailure]).
  int get _failIdx => _failureStepIndex(stage);

  /// The step index currently in progress (only meaningful when not failure/success).
  int get _progressIdx => _progressStepIndex(stage);

  // ── Step state per row ─────────────────────────────────────────────────────

  /// Whether step [i] should render as ✓ (completed green).
  bool _isDone(int i) {
    if (_isFailure) {
      // Steps before the failure point were completed successfully.
      return i < _failIdx;
    }
    if (_isSuccess) {
      // All steps are done on success.
      return true;
    }
    // In-progress: steps strictly before the current one are done.
    return i < _progressIdx;
  }

  /// Whether step [i] is the currently active spinner.
  bool _isCurrent(int i) {
    if (_isFailure || _isSuccess) return false;
    return i == _progressIdx;
  }

  /// Whether step [i] should render as ❌ (only one step, only on failure).
  bool _isFailedHere(int i) {
    if (!_isFailure) return false;
    return i == _failIdx;
  }

  /// Whether step [i] should render as ○ (not yet reached).
  bool _isPending(int i) {
    return !_isDone(i) && !_isCurrent(i) && !_isFailedHere(i);
  }

  // ── Title & subtitle ───────────────────────────────────────────────────────

  String _title() {
    if (_isSuccess) return 'Order placed!';
    if (_isFailure) return _failureTitle();
    return 'Processing your order';
  }

  String _subtitle() {
    if (_isSuccess) return 'Your payment was confirmed and your order is on its way.';
    if (_isFailure) {
      return failReason?.isNotEmpty == true
          ? failReason!
          : 'Something went wrong with your payment.';
    }
    return 'This only takes a moment. Keep this screen open.';
  }

  String _failureTitle() {
    switch (stage) {
      case CheckoutStage.cancelled:
        return 'Payment cancelled';
      case CheckoutStage.timedOut:
        return 'No confirmation received';
      case CheckoutStage.failed:
      default:
        return 'Payment failed';
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F172A);
    final textSecondary = isDark ? Colors.white70 : const Color(0xFF64748B);

    return SafeArea(
      // Center the content when it fits, but scroll instead of overflowing when
      // it doesn't — the failure state (icon + long provider reason + 5 steps +
      // up to 3 buttons) is taller than a small phone screen and would otherwise
      // throw a RenderFlex overflow.
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
            // ── Status icon ──────────────────────────────────────────────────
            if (_isSuccess || _isFailure) ...[
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: (_isSuccess
                            ? const Color(0xFF16A34A)
                            : const Color(0xFFDC2626))
                        .withAlpha(25),
                  ),
                  child: Icon(
                    _isSuccess ? Icons.check_circle_rounded : Icons.error_rounded,
                    size: 36,
                    color: _isSuccess
                        ? const Color(0xFF16A34A)
                        : const Color(0xFFDC2626),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // ── Title ────────────────────────────────────────────────────────
            Text(
              _title(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: textPrimary,
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),

            // ── Subtitle / fail reason ────────────────────────────────────────
            Text(
              _subtitle(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: textSecondary,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),

            // ── Step list ─────────────────────────────────────────────────────
            ..._steps.asMap().entries.map((entry) {
              final i = entry.key;
              final step = entry.value;
              return _StepRow(
                step: step,
                done: _isDone(i),
                current: _isCurrent(i),
                failedHere: _isFailedHere(i),
                pending: _isPending(i),
                textPrimary: textPrimary,
                textSecondary: textSecondary,
              );
            }),

            // ── Action buttons (failure only) ─────────────────────────────────
            if (_isFailure) ...[
              const SizedBox(height: 28),
              if (canRetry && onRetry != null)
                ElevatedButton(
                  onPressed: onRetry,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    'Try again',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              if (onCheckStatus != null) ...[
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: onCheckStatus,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text('Check payment status'),
                ),
              ],
              if (onCancel != null) ...[
                const SizedBox(height: 6),
                TextButton(
                  onPressed: onCancel,
                  child: const Text('Back to payment'),
                ),
              ],
            ],

            // ── Success actions ───────────────────────────────────────────────
            if (_isSuccess && onCancel != null) ...[
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: onCancel,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'View order',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Individual step row ───────────────────────────────────────────────────────

class _StepRow extends StatelessWidget {
  final _Step step;
  final bool done;
  final bool current;
  final bool failedHere;
  final bool pending;
  final Color textPrimary;
  final Color textSecondary;

  const _StepRow({
    required this.step,
    required this.done,
    required this.current,
    required this.failedHere,
    required this.pending,
    required this.textPrimary,
    required this.textSecondary,
  });

  @override
  Widget build(BuildContext context) {
    final Widget leading;

    if (failedHere) {
      leading = const Icon(Icons.error, color: Color(0xFFDC2626), size: 24);
    } else if (done) {
      leading = const Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 24);
    } else if (current) {
      leading = const SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
        ),
      );
    } else {
      // pending — not yet reached
      leading = Icon(
        Icons.circle_outlined,
        color: textSecondary.withAlpha(90),
        size: 22,
      );
    }

    final bool emphasised = current || failedHere;
    final Color labelColor = (done || emphasised) ? textPrimary : textSecondary;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 26, child: Center(child: leading)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.label,
                  style: TextStyle(
                    color: labelColor,
                    fontSize: 15,
                    fontWeight:
                        emphasised ? FontWeight.bold : FontWeight.w600,
                  ),
                ),
                if (current)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      step.hint,
                      style: TextStyle(
                        color: textSecondary,
                        fontSize: 12.5,
                        height: 1.3,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
