import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';

enum LegalDocumentType { privacyPolicy, termsOfService }

class LegalDocumentScreen extends StatelessWidget {
  const LegalDocumentScreen({super.key, required this.type});

  final LegalDocumentType type;

  bool get _isPrivacy => type == LegalDocumentType.privacyPolicy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = _isPrivacy ? 'Privacy Policy' : 'Terms of Service';
    final sections = _isPrivacy ? _privacySections : _termsSections;

    return Scaffold(
      appBar: AppBar(title: Text(title), centerTitle: true),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Text(
            'Last updated: 15 August 2026',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            _isPrivacy
                ? 'Gaarsis Delivery App respects your privacy and protects your personal information.'
                : 'Please read these terms carefully before using Gaarsis Delivery App.',
            style: theme.textTheme.bodyLarge?.copyWith(height: 1.5),
          ),
          const SizedBox(height: 24),
          ...sections.map(
            (section) => _Section(title: section.$1, body: section.$2),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              'Questions? Contact Gaarsis support through the app.',
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  static const _privacySections = <(String, String)>[
    (
      'Information we collect',
      'We collect information you provide when creating an account or placing an order, such as your name, phone number, email address, delivery address, vehicle details, and payment information.',
    ),
    (
      'How we use your information',
      'We use your information to provide deliveries and vehicle services, process payments, communicate order updates, improve the app, and help keep the platform secure.',
    ),
    (
      'Location information',
      'With your permission, we use your location to identify delivery addresses, support live order tracking, and connect you with nearby services. You can change location permission in your device settings.',
    ),
    (
      'Sharing information',
      'We share only the details needed to fulfil your order with relevant vendors, drivers, and service providers. We do not sell your personal information.',
    ),
    (
      'Data security',
      'We use reasonable technical and organisational safeguards to protect your information. No online system can guarantee absolute security.',
    ),
    (
      'Your choices',
      'You may update your account information or notification preferences in the app. You can contact support to request help with your personal data.',
    ),
  ];

  static const _termsSections = <(String, String)>[
    (
      'Using the app',
      'You must provide accurate account and order information, keep your account secure, and use the app only for lawful purposes.',
    ),
    (
      'Orders and services',
      'Orders are subject to availability, vendor acceptance, and service-area coverage. Prices, delivery times, and availability may change before an order is confirmed.',
    ),
    (
      'Payments',
      'You are responsible for ensuring that payment information is correct and that sufficient funds are available. A booking or order is confirmed only after successful payment where required.',
    ),
    (
      'Cancellations and refunds',
      'Cancellation and refund eligibility may depend on the status of your order, the vendor, and applicable payment rules. Contact support if you need assistance.',
    ),
    (
      'User conduct',
      'Do not misuse the app, interfere with its operation, submit false orders, or abuse vendors, drivers, workers, or other users.',
    ),
    (
      'Changes to these terms',
      'We may update these terms when necessary. Continued use of the app after an update means that you accept the revised terms.',
    ),
  ];
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(body, style: theme.textTheme.bodyMedium?.copyWith(height: 1.55)),
        ],
      ),
    );
  }
}
