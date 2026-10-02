import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';

class PaymentMethodsScreen extends StatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  State<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends State<PaymentMethodsScreen> {
  List<Map<String, dynamic>> _cards = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadCards();
  }

  Future<void> _loadCards() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cardsJson = prefs.getString('saved_payment_methods');
      if (cardsJson != null) {
        final List<dynamic> decoded = jsonDecode(cardsJson);
        if (mounted) {
          setState(() {
            _cards = decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          });
        }
      } else {
        // Seed default dummy cards if empty to show interactive state
        _cards = [
          {
            'id': '1',
            'cardholderName': 'Alex Morgan',
            'cardNumber': '**** **** **** 4321',
            'expiryDate': '12/28',
            'cardType': 'Visa',
            'isDefault': true,
          },
          {
            'id': '2',
            'cardholderName': 'Alex Morgan',
            'cardNumber': '**** **** **** 8899',
            'expiryDate': '09/27',
            'cardType': 'MasterCard',
            'isDefault': false,
          }
        ];
        await _saveCardsToPrefs();
      }
    } catch (e) {
      debugPrint('Error loading cards: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _saveCardsToPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('saved_payment_methods', jsonEncode(_cards));
    } catch (e) {
      debugPrint('Error saving cards: $e');
    }
  }

  Future<void> _addCard(Map<String, dynamic> newCard) async {
    setState(() {
      if (newCard['isDefault'] == true) {
        for (var card in _cards) {
          card['isDefault'] = false;
        }
      }
      _cards.add(newCard);
    });
    await _saveCardsToPrefs();
  }

  Future<void> _deleteCard(String id) async {
    setState(() {
      final index = _cards.indexWhere((c) => c['id'] == id);
      if (index != -1) {
        final wasDefault = _cards[index]['isDefault'] == true;
        _cards.removeAt(index);
        if (wasDefault && _cards.isNotEmpty) {
          _cards.first['isDefault'] = true;
        }
      }
    });
    await _saveCardsToPrefs();
  }

  Future<void> _setDefaultCard(String id) async {
    setState(() {
      for (var card in _cards) {
        card['isDefault'] = card['id'] == id;
      }
    });
    await _saveCardsToPrefs();
  }

  void _showAddCardBottomSheet() {
    final formKey = GlobalKey<FormState>();
    final nameController = TextEditingController();
    final numberController = TextEditingController();
    final expiryController = TextEditingController();
    final cvvController = TextEditingController();
    String selectedCardType = 'Visa';
    bool makeDefault = _cards.isEmpty;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        final theme = Theme.of(context);
        final cs = theme.colorScheme;
        final isDark = theme.brightness == Brightness.dark;
        final modalBg = theme.bottomSheetTheme.backgroundColor ?? (isDark ? AppColors.surfaceDark : Colors.white);
        final textPrimary = cs.onSurface;
        final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
        final inputFill = isDark ? AppColors.surfaceCard : Colors.grey.shade100;

        return StatefulBuilder(
          builder: (context, setStateModal) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              child: Container(
                decoration: BoxDecoration(
                  color: modalBg,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                ),
                padding: const EdgeInsets.all(AppSpacing.l),
                child: SingleChildScrollView(
                  child: Form(
                    key: formKey,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Center(
                          child: Container(
                            width: 48,
                            height: 4,
                            margin: const EdgeInsets.only(bottom: AppSpacing.l),
                            decoration: BoxDecoration(
                              color: textSecondary.withAlpha(100),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                        Text(
                          'Add New Card',
                          style: TextStyle(
                            color: textPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 20,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.m),
                        
                        // Card Type Selector
                        Text(
                          'Card Provider',
                          style: TextStyle(
                            color: textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.s),
                        Row(
                          children: [
                            _buildCardTypeRadio('Visa', selectedCardType, (val) {
                              setStateModal(() => selectedCardType = val);
                            }),
                            const SizedBox(width: AppSpacing.l),
                            _buildCardTypeRadio('MasterCard', selectedCardType, (val) {
                              setStateModal(() => selectedCardType = val);
                            }),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.m),

                        // Cardholder Name
                        TextFormField(
                          controller: nameController,
                          style: TextStyle(color: textPrimary),
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: inputFill,
                            labelText: 'Cardholder Name',
                            labelStyle: TextStyle(color: textSecondary),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return 'Please enter name';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.m),

                        // Card Number
                        TextFormField(
                          controller: numberController,
                          style: TextStyle(color: textPrimary),
                          keyboardType: TextInputType.number,
                          maxLength: 16,
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: inputFill,
                            labelText: 'Card Number',
                            labelStyle: TextStyle(color: textSecondary),
                            counterText: '',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                          validator: (value) {
                            if (value == null || value.length < 15) {
                              return 'Enter a valid card number';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.m),

                        // Expiry & CVV
                        Row(
                          children: [
                            Expanded(
                              child: TextFormField(
                                controller: expiryController,
                                style: TextStyle(color: textPrimary),
                                keyboardType: TextInputType.datetime,
                                decoration: InputDecoration(
                                  filled: true,
                                  fillColor: inputFill,
                                  labelText: 'Expiry (MM/YY)',
                                  labelStyle: TextStyle(color: textSecondary),
                                  hintText: 'MM/YY',
                                  hintStyle: TextStyle(color: textSecondary.withAlpha(120)),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide.none,
                                  ),
                                ),
                                validator: (value) {
                                  if (value == null || !value.contains('/') || value.length != 5) {
                                    return 'MM/YY required';
                                  }
                                  return null;
                                },
                              ),
                            ),
                            const SizedBox(width: AppSpacing.m),
                            Expanded(
                              child: TextFormField(
                                controller: cvvController,
                                style: TextStyle(color: textPrimary),
                                keyboardType: TextInputType.number,
                                obscureText: true,
                                maxLength: 4,
                                decoration: InputDecoration(
                                  filled: true,
                                  fillColor: inputFill,
                                  labelText: 'CVV',
                                  labelStyle: TextStyle(color: textSecondary),
                                  counterText: '',
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide.none,
                                  ),
                                ),
                                validator: (value) {
                                  if (value == null || value.length < 3) {
                                    return 'CVV required';
                                  }
                                  return null;
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.m),

                        // Make Default Switch
                        SwitchListTile(
                          title: Text(
                            'Set as default payment method',
                            style: TextStyle(color: textPrimary, fontSize: 14),
                          ),
                          value: makeDefault,
                          activeThumbColor: AppColors.primary,
                          contentPadding: EdgeInsets.zero,
                          onChanged: _cards.isEmpty
                              ? null
                              : (value) {
                                  setStateModal(() => makeDefault = value);
                                },
                        ),
                        const SizedBox(height: AppSpacing.l),

                        CustomButton(
                          text: 'Save Card',
                          onPressed: () {
                            if (formKey.currentState?.validate() ?? false) {
                              final numStr = numberController.text;
                              final maskedNum = '**** **** **** ${numStr.substring(numStr.length - 4)}';
                              _addCard({
                                'id': DateTime.now().millisecondsSinceEpoch.toString(),
                                'cardholderName': nameController.text.trim(),
                                'cardNumber': maskedNum,
                                'expiryDate': expiryController.text,
                                'cardType': selectedCardType,
                                'isDefault': makeDefault,
                              });
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Card added successfully!')),
                              );
                            }
                          },
                        ),
                        const SizedBox(height: AppSpacing.m),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildCardTypeRadio(String type, String current, ValueChanged<String> onChanged) {
    final theme = Theme.of(context);
    final textPrimary = theme.colorScheme.onSurface;
    final isSelected = type == current;
    return GestureDetector(
      onTap: () => onChanged(type),
      child: Row(
        children: [
          Icon(
            isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
            color: isSelected ? AppColors.primary : Colors.grey,
            size: 20,
          ),
          const SizedBox(width: 8),
          Text(
            type,
            style: TextStyle(color: textPrimary, fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        title: Text(
          'Payment Methods',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _cards.isEmpty
                ? _buildEmptyState(textPrimary, textSecondary)
                : ListView.builder(
                    padding: const EdgeInsets.all(AppSpacing.m),
                    itemCount: _cards.length,
                    itemBuilder: (context, index) {
                      final card = _cards[index];
                      return _buildCardItem(card, isDark, textPrimary, textSecondary, borderColor);
                    },
                  ),
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(AppSpacing.m),
        child: CustomButton(
          text: 'Add New Card',
          onPressed: _showAddCardBottomSheet,
          icon: const Icon(Icons.add, color: Colors.white),
        ),
      ),
    );
  }

  Widget _buildEmptyState(Color textPrimary, Color textSecondary) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.xl),
              decoration: BoxDecoration(
                color: AppColors.primary.withAlpha(20),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.credit_card,
                size: 64,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: AppSpacing.l),
            Text(
              'No Saved Cards',
              style: TextStyle(
                color: textPrimary,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: AppSpacing.s),
            Text(
              'Add a credit or debit card to checkout faster next time.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: textSecondary,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCardItem(
    Map<String, dynamic> card,
    bool isDark,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    final id = card['id'].toString();
    final isDefault = card['isDefault'] == true;
    final cardType = card['cardType'] ?? 'Visa';
    final number = card['cardNumber'] ?? '';
    final name = card['cardholderName'] ?? '';
    final expiry = card['expiryDate'] ?? '';

    // Choose gradient for physical card display
    final List<Color> cardGradient = cardType == 'Visa'
        ? [const Color(0xFF1E88E5), const Color(0xFF1565C0)]
        : [const Color(0xFF37474F), const Color(0xFF212121)];

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDefault ? AppColors.primary : borderColor,
          width: isDefault ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 30 : 10),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // Physical Card Look Container
          Container(
            height: 160,
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.l),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: cardGradient,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      cardType.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 20,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                    const Icon(
                      Icons.nfc,
                      color: Colors.white70,
                      size: 24,
                    ),
                  ],
                ),
                Text(
                  number,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 2,
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'CARDHOLDER',
                          style: TextStyle(color: Colors.white54, fontSize: 9, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          name.toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'EXPIRES',
                          style: TextStyle(color: Colors.white54, fontSize: 9, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          expiry,
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          
          // Card Controls (Set Default & Delete)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m, vertical: AppSpacing.s),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Radio<bool>(
                      value: true,
                      groupValue: isDefault,
                      activeColor: AppColors.primary,
                      onChanged: (val) {
                        if (!isDefault) {
                          _setDefaultCard(id);
                        }
                      },
                    ),
                    Text(
                      isDefault ? 'Default Method' : 'Set as Default',
                      style: TextStyle(
                        color: isDefault ? AppColors.primary : textSecondary,
                        fontSize: 13,
                        fontWeight: isDefault ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                  onPressed: () => _confirmDeleteCard(id),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteCard(String id) {
    showDialog(
      context: context,
      builder: (context) {
        final theme = Theme.of(context);
        final cs = theme.colorScheme;
        return AlertDialog(
          title: const Text('Delete Card'),
          content: const Text('Are you sure you want to remove this card?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text('Cancel', style: TextStyle(color: cs.onSurface.withAlpha(150))),
            ),
            TextButton(
              onPressed: () {
                _deleteCard(id);
                Navigator.pop(context);
              },
              child: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
            ),
          ],
        );
      },
    );
  }
}
