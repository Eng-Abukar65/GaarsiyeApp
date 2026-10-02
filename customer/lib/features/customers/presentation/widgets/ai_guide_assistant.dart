import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/constants/app_colors.dart';

class GuideTopic {
  final String id;
  final String title;
  final IconData icon;
  final List<String> steps;

  const GuideTopic({
    required this.id,
    required this.title,
    required this.icon,
    required this.steps,
  });
}

class AiGuideAssistant extends StatefulWidget {
  final String contextPage; // 'home', 'cart', 'checkout', 'tracking'

  const AiGuideAssistant({super.key, required this.contextPage});

  @override
  State<AiGuideAssistant> createState() => _AiGuideAssistantState();
}

class _AiGuideAssistantState extends State<AiGuideAssistant>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  Set<String> _completedTopics = {};
  bool _hasInitialized = false;

  final List<GuideTopic> _topics = const [
    GuideTopic(
      id: 'fuel',
      title: 'How to order fuel',
      icon: Icons.local_gas_station,
      steps: [
        'From the Home page, select "Fuel Delivery" or "Gas Station" from the service list.',
        'Select your fuel type (e.g., Petrol 91, Petrol 95, or Diesel) and enter the desired quantity in liters.',
        'Choose your delivery location on the map, select a delivery time slot, and proceed to checkout to place your order.',
      ],
    ),
    GuideTopic(
      id: 'spare_parts',
      title: 'How to order spare parts',
      icon: Icons.build,
      steps: [
        'Select "Spare Parts Shop" from the Home screen categories.',
        'Browse the available products, search for specific parts, and tap on a product to view details.',
        'Tap "Add to Cart", then open your Shopping Cart to review your items and tap "Proceed to Checkout".',
      ],
    ),
    GuideTopic(
      id: 'tracking',
      title: 'How to track delivery',
      icon: Icons.map,
      steps: [
        'Go to your Profile or check the Home screen for "Recent Orders" and select an active order.',
        'Tap "Track Order" or "Live Tracking" on the order status screen.',
        'You will see the driver\'s real-time location on the map, their contact details, and the estimated delivery time.',
      ],
    ),
    GuideTopic(
      id: 'offers',
      title: 'How to use offers',
      icon: Icons.local_offer,
      steps: [
        'On the Home screen, scroll down to the "Nearby Offers" or "Limited Time Deals" section.',
        'Select an offer to view details. Tap "Claim" or copy the promo code.',
        'In your Shopping Cart, enter the code in the "Promo code" field and tap "Apply" to get your discount.',
      ],
    ),
    GuideTopic(
      id: 'schedule',
      title: 'How to schedule delivery',
      icon: Icons.calendar_month,
      steps: [
        'Add items to your cart and proceed to the Checkout screen.',
        'On the checkout screens, choose "Schedule Delivery" to see the delivery date and time slots.',
        'Select your preferred date (Today, Tomorrow, etc.) and choose a convenient time window, then proceed to payment.',
      ],
    ),
    GuideTopic(
      id: 'payments',
      title: 'How to make payments',
      icon: Icons.payment,
      steps: [
        'On the checkout flow, tap "Proceed to Payment" to choose your payment method.',
        'Select either Wallet or Credit/Debit Card (Visa/Mastercard).',
        'Enter the required details for your chosen method and tap "Review Order".',
      ],
    ),
    GuideTopic(
      id: 'support',
      title: 'How to contact support',
      icon: Icons.support_agent,
      steps: [
        'Go to the Profile screen from the bottom navigation bar or top header.',
        'Scroll down and select "Support" or "Help Center" to contact our customer support team.',
        'You can call, WhatsApp, or open a live chat to get immediate help with your orders or account.',
      ],
    ),
  ];

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _loadState();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _loadState() async {
    final prefs = await SharedPreferences.getInstance();
    final completed = prefs.getStringList('ai_completed_tutorials') ?? [];
    setState(() {
      _completedTopics = completed.toSet();
      _hasInitialized = true;
    });

    if (widget.contextPage == 'home') {
      final shownWelcome = prefs.getBool('ai_shown_welcome_assistant') ?? false;
      if (!shownWelcome) {
        // Automatically trigger welcome assistant
        await prefs.setBool('ai_shown_welcome_assistant', true);
        Future.delayed(const Duration(milliseconds: 800), () {
          if (mounted) {
            _openAssistantSheet(isWelcome: true);
          }
        });
      }
    }
  }

  Future<void> _markTopicCompleted(String id) async {
    final prefs = await SharedPreferences.getInstance();
    _completedTopics.add(id);
    await prefs.setStringList(
      'ai_completed_tutorials',
      _completedTopics.toList(),
    );
    setState(() {});
  }

  void _openAssistantSheet({bool isWelcome = false}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return _AiAssistantSheet(
          topics: _topics,
          completedTopics: _completedTopics,
          contextPage: widget.contextPage,
          onComplete: _markTopicCompleted,
          initialWelcome: isWelcome,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasInitialized) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(
                  0.3 * (1 - _pulseController.value),
                ),
                spreadRadius: 8 * _pulseController.value,
                blurRadius: 10 * _pulseController.value,
              ),
            ],
          ),
          child: FloatingActionButton.extended(
            heroTag: 'ai_guide_fab_${widget.contextPage}',
            onPressed: () => _openAssistantSheet(isWelcome: false),
            icon: const Icon(Icons.psychology, color: Colors.white, size: 24),
            label: const Text(
              'AI Help',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
                color: Colors.white,
              ),
            ),
            backgroundColor: AppColors.primary,
            elevation: 4,
          ),
        );
      },
    );
  }
}

class _AiAssistantSheet extends StatefulWidget {
  final List<GuideTopic> topics;
  final Set<String> completedTopics;
  final String contextPage;
  final Function(String) onComplete;
  final bool initialWelcome;

  const _AiAssistantSheet({
    required this.topics,
    required this.completedTopics,
    required this.contextPage,
    required this.onComplete,
    required this.initialWelcome,
  });

  @override
  State<_AiAssistantSheet> createState() => _AiAssistantSheetState();
}

class _AiAssistantSheetState extends State<_AiAssistantSheet> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  GuideTopic? _selectedTopic;
  int _currentStepIndex = 0;
  bool _showWelcomeMessage = false;

  @override
  void initState() {
    super.initState();
    _showWelcomeMessage = widget.initialWelcome;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _getPageTitle() {
    switch (widget.contextPage) {
      case 'home':
        return 'Home Dashboard';
      case 'cart':
        return 'Shopping Cart';
      case 'checkout':
        return 'Checkout';
      case 'tracking':
        return 'Order Tracking';
      default:
        return 'App Screen';
    }
  }

  String _getPageExplanation() {
    switch (widget.contextPage) {
      case 'home':
        return 'This is your Home Dashboard. Here you can browse our core services (Fuel Delivery, Gas Cylinders, Spare Parts), view nearby offers, and check your recent orders.';
      case 'cart':
        return 'This is your Shopping Cart. Here you can review items you have added (fuel, gas, or spare parts), adjust quantities, apply promo codes, and see the price summary before proceeding to checkout.';
      case 'checkout':
        return 'This is the Checkout Screen. You can select your delivery zone (which determines the delivery fee), choose your preferred delivery schedule (instant or scheduled), and select a payment method before placing your order.';
      case 'tracking':
        return 'This is the Order Tracking page. You can track your fuel or spare parts delivery in real-time, view the driver\'s current position, monitor the order status, and contact support if you need assistance.';
      default:
        return 'This page helps you navigate and operate the Garsiis delivery features.';
    }
  }

  List<GuideTopic> _getFilteredTopics() {
    if (_searchQuery.trim().isEmpty) {
      return widget.topics;
    }
    final query = _searchQuery.toLowerCase();
    return widget.topics.where((topic) {
      // Search in title
      if (topic.title.toLowerCase().contains(query)) return true;
      // Search in steps
      for (final step in topic.steps) {
        if (step.toLowerCase().contains(query)) return true;
      }
      return false;
    }).toList();
  }

  void _startTutorial(GuideTopic topic) {
    setState(() {
      _selectedTopic = topic;
      _currentStepIndex = 0;
      _showWelcomeMessage = false;
    });
  }

  void _nextStep() {
    if (_selectedTopic == null) return;
    if (_currentStepIndex < _selectedTopic!.steps.length - 1) {
      setState(() {
        _currentStepIndex++;
      });
    } else {
      // Complete tutorial
      widget.onComplete(_selectedTopic!.id);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.stars, color: Colors.amber),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Tutorial "${_selectedTopic!.title}" completed successfully!',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ),
      );
      setState(() {
        _selectedTopic = null;
      });
    }
  }

  void _backToList() {
    setState(() {
      _selectedTopic = null;
      _showWelcomeMessage = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primaryColor = AppColors.primary;
    final cardBgColor = isDark ? AppColors.surfaceDark : Colors.white;
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      decoration: BoxDecoration(
        color: cardBgColor,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(28),
          topRight: Radius.circular(28),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 15,
            spreadRadius: 2,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 50,
              height: 4,
              decoration: BoxDecoration(
                color: borderCol.withOpacity(0.5),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: primaryColor.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.psychology, color: primaryColor, size: 28),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Garsiis App',
                      style: TextStyle(
                        color: textPrimary,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      _selectedTopic != null
                          ? 'Tutorial Walkthrough'
                          : 'Help Center & Guides',
                      style: TextStyle(color: textSecondary, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.close, color: textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Main body (Welcome message / Selected step-by-step / Search + Topic list)
          Flexible(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_showWelcomeMessage) ...[
                    _buildWelcomeBanner(
                      primaryColor,
                      textPrimary,
                      textSecondary,
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_selectedTopic != null)
                    _buildTutorialFlow(
                      primaryColor,
                      textPrimary,
                      textSecondary,
                      borderCol,
                    )
                  else ...[
                    // Context awareness section (only shown when not in a tutorial)
                    _buildContextBanner(
                      primaryColor,
                      textPrimary,
                      textSecondary,
                    ),
                    const SizedBox(height: 16),

                    // Search input
                    _buildSearchField(
                      isDark,
                      textPrimary,
                      textSecondary,
                      borderCol,
                    ),
                    const SizedBox(height: 16),

                    // Help Topics Header
                    Text(
                      'AI Help Guides',
                      style: TextStyle(
                        color: textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Topics list
                    _buildTopicsList(
                      primaryColor,
                      textPrimary,
                      textSecondary,
                      borderCol,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWelcomeBanner(
    Color primary,
    Color textPrimary,
    Color textSecondary,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [primary.withOpacity(0.25), primary.withOpacity(0.05)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: primary.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.waving_hand, color: Colors.orange, size: 20),
              const SizedBox(width: 8),
              Text(
                'Welcome to Garsiis App!',
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'I am your AI Guide Assistant. I can help you learn how to order fuel, track deliveries, use offers, and much more. Tap any topic below or use search to get started!',
            style: TextStyle(color: textSecondary, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _buildContextBanner(
    Color primary,
    Color textPrimary,
    Color textSecondary,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: primary.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: primary.withOpacity(0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: primary.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.lightbulb, color: primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Current Screen: ${_getPageTitle()}',
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _getPageExplanation(),
                  style: TextStyle(
                    color: textSecondary,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchField(
    bool isDark,
    Color textPrimary,
    Color textSecondary,
    Color borderCol,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark.withAlpha(80)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderCol.withOpacity(0.8)),
      ),
      child: TextField(
        controller: _searchController,
        style: TextStyle(color: textPrimary),
        onChanged: (val) {
          setState(() {
            _searchQuery = val;
          });
        },
        decoration: InputDecoration(
          hintText: 'Search help center & guides...',
          hintStyle: TextStyle(
            color: textSecondary.withOpacity(0.7),
            fontSize: 14,
          ),
          prefixIcon: Icon(Icons.search, color: textSecondary.withOpacity(0.8)),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  onPressed: () {
                    setState(() {
                      _searchController.clear();
                      _searchQuery = '';
                    });
                  },
                  icon: Icon(Icons.clear, color: textSecondary),
                )
              : null,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
        ),
      ),
    );
  }

  Widget _buildTopicsList(
    Color primary,
    Color textPrimary,
    Color textSecondary,
    Color borderCol,
  ) {
    final filtered = _getFilteredTopics();

    if (filtered.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 30),
          child: Column(
            children: [
              Icon(
                Icons.search_off,
                color: textSecondary.withOpacity(0.5),
                size: 48,
              ),
              const SizedBox(height: 8),
              Text(
                'No matching guide topics found',
                style: TextStyle(
                  color: textSecondary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Try searching for keywords like "fuel", "card", "slot"',
                style: TextStyle(
                  color: textSecondary.withOpacity(0.7),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: filtered.length,
      separatorBuilder: (_, __) =>
          Divider(color: borderCol.withOpacity(0.5), height: 1),
      itemBuilder: (context, index) {
        final topic = filtered[index];
        final isCompleted = widget.completedTopics.contains(topic.id);

        return ListTile(
          onTap: () => _startTutorial(topic),
          contentPadding: const EdgeInsets.symmetric(
            vertical: 6,
            horizontal: 8,
          ),
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isCompleted
                  ? AppColors.success.withOpacity(0.12)
                  : primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              topic.icon,
              color: isCompleted ? AppColors.success : primary,
              size: 22,
            ),
          ),
          title: Text(
            topic.title,
            style: TextStyle(
              color: textPrimary,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
          subtitle: Text(
            '${topic.steps.length} Steps Walkthrough',
            style: TextStyle(
              color: textSecondary.withOpacity(0.8),
              fontSize: 11,
            ),
          ),
          trailing: isCompleted
              ? Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.success.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.check_circle,
                        color: AppColors.success,
                        size: 12,
                      ),
                      SizedBox(width: 4),
                      Text(
                        'Completed',
                        style: TextStyle(
                          color: AppColors.success,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                )
              : Icon(
                  Icons.arrow_forward_ios,
                  color: textSecondary.withOpacity(0.5),
                  size: 14,
                ),
        );
      },
    );
  }

  Widget _buildTutorialFlow(
    Color primary,
    Color textPrimary,
    Color textSecondary,
    Color borderCol,
  ) {
    final topic = _selectedTopic!;
    final stepText = topic.steps[_currentStepIndex];
    final isLastStep = _currentStepIndex == topic.steps.length - 1;
    final progress = (_currentStepIndex + 1) / topic.steps.length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: primary.withOpacity(0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: borderCol.withOpacity(0.8)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with back button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton.icon(
                onPressed: _backToList,
                icon: Icon(Icons.arrow_back, color: primary, size: 18),
                label: Text(
                  'Back to Guides',
                  style: TextStyle(color: primary, fontWeight: FontWeight.bold),
                ),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(60, 30),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Step ${_currentStepIndex + 1} of ${topic.steps.length}',
                  style: TextStyle(
                    color: primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Topic Title
          Row(
            children: [
              Icon(topic.icon, color: primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  topic.title,
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: borderCol.withOpacity(0.3),
              valueColor: AlwaysStoppedAnimation<Color>(primary),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 20),

          // Step instruction content
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white10,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              stepText,
              style: TextStyle(color: textPrimary, fontSize: 14, height: 1.5),
            ),
          ),
          const SizedBox(height: 24),

          // Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_currentStepIndex > 0)
                OutlinedButton(
                  onPressed: () {
                    setState(() {
                      _currentStepIndex--;
                    });
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: primary,
                    side: BorderSide(color: primary),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text('Previous'),
                ),
              const SizedBox(width: 12),
              ElevatedButton(
                onPressed: _nextStep,
                style: ElevatedButton.styleFrom(
                  backgroundColor: isLastStep ? AppColors.success : primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  elevation: 0,
                ),
                child: Text(
                  isLastStep ? 'Finish Guide' : 'Next Step',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
