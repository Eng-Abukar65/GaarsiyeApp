import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/utils/api_service.dart';

class EarningsWalletScreen extends StatefulWidget {
  const EarningsWalletScreen({super.key});

  @override
  State<EarningsWalletScreen> createState() => _EarningsWalletScreenState();
}

class _EarningsWalletScreenState extends State<EarningsWalletScreen> with SingleTickerProviderStateMixin {
  bool _isLoading = true;
  Map<String, dynamic> _earnings = {};
  List<dynamic> _transactions = [];
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _fadeAnimation = CurvedAnimation(parent: _animationController, curve: Curves.easeIn);
    _fetchWalletData();
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  Future<void> _fetchWalletData() async {
    setState(() => _isLoading = true);
    try {
      final earningsRes = await ApiService.get('/driver/earnings');
      final transactionsRes = await ApiService.get('/driver/transactions');

      if (earningsRes.statusCode == 200 && transactionsRes.statusCode == 200) {
        setState(() {
          _earnings = jsonDecode(earningsRes.body);
          _transactions = jsonDecode(transactionsRes.body);
        });
        _animationController.forward(from: 0.0);
      }
    } catch (e) {
      print('Error fetching wallet data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    return Scaffold(
      backgroundColor: const Color(0xFF071224),
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Earnings & Wallet', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        centerTitle: true,
      ),
      body: _isLoading ? _buildSkeletonLoading() : _buildContent(),
    );
  }

  Widget _buildContent() {
    return RefreshIndicator(
      onRefresh: _fetchWalletData,
      color: AppColors.primary,
      backgroundColor: const Color(0xFF0F1B33),
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.only(
            top: MediaQuery.of(context).padding.top + kToolbarHeight + 20,
            left: AppSpacing.l,
            right: AppSpacing.l,
            bottom: AppSpacing.xxl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildBalanceCard(),
              const SizedBox(height: 32),
              const Text('Earnings Summary', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
              const SizedBox(height: 16),
              _buildEarningsSummary(),
              const SizedBox(height: 32),
              const Text('Recent Activity', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
              const SizedBox(height: 16),
              _buildTransactionHistory(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSkeletonLoading() {
    final skeletonDecoration = BoxDecoration(
      color: const Color(0xFF0F1B33),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Colors.white.withOpacity(0.08)),
    );
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.l),
        child: Column(
          children: [
            Container(height: 160, decoration: skeletonDecoration),
            const SizedBox(height: 32),
            Row(
              children: [
                Expanded(child: Container(height: 100, decoration: skeletonDecoration)),
                const SizedBox(width: 16),
                Expanded(child: Container(height: 100, decoration: skeletonDecoration)),
              ],
            ),
            const SizedBox(height: 32),
            Expanded(
              child: ListView.builder(
                itemCount: 4,
                itemBuilder: (context, index) => Container(
                  height: 80,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: skeletonDecoration,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBalanceCard() {
    final balance = _earnings['wallet_balance']?.toString() ?? '0.00';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F1B33), Color(0xFF152544)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF00B2FF).withOpacity(0.12),
            blurRadius: 20,
            spreadRadius: -5,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -20,
            top: -20,
            child: Icon(Icons.account_balance_wallet, size: 100, color: Colors.white.withOpacity(0.03)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF152544),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withOpacity(0.06)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.shield_outlined, color: Color(0xFF4ADE80), size: 14),
                    SizedBox(width: 6),
                    Text('Secure Wallet', style: TextStyle(color: Color(0xFFA8B3CF), fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const Text('Available Balance', style: TextStyle(color: Color(0xFFA8B3CF), fontSize: 14, letterSpacing: 0.5, fontWeight: FontWeight.w500)),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  const Text('\$', style: TextStyle(color: Color(0xFF00B2FF), fontSize: 24, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 4),
                  Text(balance, style: const TextStyle(color: Color(0xFFF5F7FA), fontSize: 42, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEarningsSummary() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: _buildSummaryCard('Today', _earnings['today_earnings'], Icons.today, const Color(0xFF00B2FF))),
            const SizedBox(width: 16),
            Expanded(child: _buildSummaryCard('This Week', _earnings['weekly_earnings'], Icons.date_range, const Color(0xFFC084FC))),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _buildSummaryCard('This Month', _earnings['monthly_earnings'], Icons.calendar_month, const Color(0xFFFB923C))),
            const SizedBox(width: 16),
            Expanded(child: _buildSummaryCard('Pending', _earnings['pending_payouts'], Icons.hourglass_empty, const Color(0xFFF87171))),
          ],
        ),
      ],
    );
  }

  Widget _buildSummaryCard(String title, dynamic amount, IconData icon, Color accentColor) {
    final displayAmount = amount?.toString() ?? '0.00';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1B33),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: accentColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accentColor.withOpacity(0.24)),
              boxShadow: [
                BoxShadow(
                  color: accentColor.withOpacity(0.15),
                  blurRadius: 8,
                  spreadRadius: 1,
                )
              ],
            ),
            child: Icon(icon, color: accentColor, size: 20),
          ),
          const SizedBox(height: 16),
          Text(
            '\$$displayAmount',
            style: TextStyle(
              color: accentColor,
              fontSize: 24,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFFA8B3CF),
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionHistory() {
    if (_transactions.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F1B33),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: const Icon(Icons.receipt_long, size: 48, color: Color(0xFF7D8AA8)),
              ),
              const SizedBox(height: 24),
              const Text('No recent activity', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Your earnings and payouts will appear here.', style: TextStyle(color: Color(0xFF7D8AA8), fontSize: 14)),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _transactions.length,
      itemBuilder: (context, index) {
        final t = _transactions[index];
        final isEarning = t['type'] == 'earning';
        final amount = t['amount'].toString();
        final date = DateTime.parse(t['created_at']);
        final formattedDate = DateFormat('MMM dd, yyyy - hh:mm a').format(date);
        
        Color statusColor;
        switch (t['status'].toString().toLowerCase()) {
          case 'completed':
            statusColor = const Color(0xFF4ADE80);
            break;
          case 'pending':
            statusColor = const Color(0xFFFBBF24);
            break;
          default:
            statusColor = const Color(0xFFF87171);
        }

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF0F1B33),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.12),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: isEarning
                        ? [const Color(0xFF4ADE80).withOpacity(0.15), const Color(0xFF4ADE80).withOpacity(0.02)]
                        : [const Color(0xFFF87171).withOpacity(0.15), const Color(0xFFF87171).withOpacity(0.02)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isEarning
                        ? const Color(0xFF4ADE80).withOpacity(0.25)
                        : const Color(0xFFF87171).withOpacity(0.25),
                  ),
                ),
                child: Icon(
                  isEarning ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
                  color: isEarning ? const Color(0xFF4ADE80) : const Color(0xFFF87171),
                  size: 20,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t['description'] ?? 'Transaction',
                      style: const TextStyle(color: Color(0xFFF5F7FA), fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formattedDate,
                      style: const TextStyle(color: Color(0xFF7D8AA8), fontSize: 12),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${isEarning ? '+' : '-'}\$$amount',
                    style: TextStyle(
                      color: isEarning ? const Color(0xFF4ADE80) : const Color(0xFFF5F7FA),
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: statusColor.withOpacity(0.24)),
                    ),
                    child: Text(
                      t['status'].toString().toUpperCase(),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
