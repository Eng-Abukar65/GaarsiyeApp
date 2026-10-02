import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/theme/theme_provider.dart';
import 'legal_document_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _orderUpdates = true;
  bool _promotions = false;
  bool _announcements = true;

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final tileColor = isDark ? AppColors.surfaceDark.withOpacity(0.5) : Colors.grey.shade100;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Settings',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.m),
          children: [
            // ── APPEARANCE ─────────────────────────────────────────────
            _sectionTitle('APPEARANCE', textSecondary),
            _darkModeToggle(themeProvider, isDark, tileColor, textPrimary, textSecondary),

            const SizedBox(height: AppSpacing.l),

            // ── NOTIFICATIONS ──────────────────────────────────────────
            _sectionTitle('NOTIFICATIONS', textSecondary),
            _switchTile(
              icon: Icons.notifications_active_outlined,
              iconColor: Colors.blue,
              title: 'Order Updates',
              subtitle: 'Status changes for your active orders',
              value: _orderUpdates,
              onChanged: (v) => setState(() => _orderUpdates = v),
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
            ),
            _switchTile(
              icon: Icons.local_offer_outlined,
              iconColor: Colors.orange,
              title: 'Promotions & Offers',
              subtitle: 'Exclusive deals and discount codes',
              value: _promotions,
              onChanged: (v) => setState(() => _promotions = v),
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
            ),
            _switchTile(
              icon: Icons.campaign_outlined,
              iconColor: Colors.green,
              title: 'System Announcements',
              subtitle: 'Important app updates and news',
              value: _announcements,
              onChanged: (v) => setState(() => _announcements = v),
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
            ),

            const SizedBox(height: AppSpacing.l),

            // ── ABOUT ──────────────────────────────────────────────────
            _sectionTitle('ABOUT', textSecondary),
            _infoTile(
              icon: Icons.info_outline,
              title: 'App Version',
              trailing: '1.0.0',
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
            ),
            _infoTile(
              icon: Icons.privacy_tip_outlined,
              title: 'Privacy Policy',
              trailing: null,
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const LegalDocumentScreen(
                    type: LegalDocumentType.privacyPolicy,
                  ),
                ),
              ),
            ),
            _infoTile(
              icon: Icons.article_outlined,
              title: 'Terms of Service',
              trailing: null,
              tileColor: tileColor,
              textPrimary: textPrimary,
              textSecondary: textSecondary,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const LegalDocumentScreen(
                    type: LegalDocumentType.termsOfService,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title, Color textSecondary) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 12),
      child: Text(
        title,
        style: TextStyle(
          color: textSecondary.withOpacity(0.5),
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _darkModeToggle(
    ThemeProvider themeProvider,
    bool isDark,
    Color tileColor,
    Color textPrimary,
    Color textSecondary,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: tileColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        leading: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isDark
                ? Colors.deepPurple.withOpacity(0.15)
                : Colors.amber.withOpacity(0.15),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            transitionBuilder: (child, anim) => RotationTransition(
              turns: anim,
              child: FadeTransition(opacity: anim, child: child),
            ),
            child: Icon(
              isDark ? Icons.dark_mode : Icons.light_mode,
              key: ValueKey(isDark),
              color: isDark ? Colors.deepPurpleAccent : Colors.amber,
              size: 20,
            ),
          ),
        ),
        title: Text(
          'Dark Mode',
          style: TextStyle(
            color: textPrimary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
        ),
        subtitle: Text(
          isDark ? 'Currently using dark theme' : 'Currently using light theme',
          style: TextStyle(color: textSecondary, fontSize: 12),
        ),
        trailing: Switch.adaptive(
          value: isDark,
          onChanged: (_) => themeProvider.toggleTheme(),
          activeColor: AppColors.primary,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }

  Widget _switchTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
    required Color tileColor,
    required Color textPrimary,
    required Color textSecondary,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: tileColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        leading: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        title: Text(
          title,
          style: TextStyle(
            color: textPrimary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: TextStyle(color: textSecondary, fontSize: 12),
        ),
        trailing: Switch.adaptive(
          value: value,
          onChanged: onChanged,
          activeColor: AppColors.primary,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }

  Widget _infoTile({
    required IconData icon,
    required String title,
    required String? trailing,
    required Color tileColor,
    required Color textPrimary,
    required Color textSecondary,
    VoidCallback? onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: tileColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        leading: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: Icon(icon, color: AppColors.primary, size: 20),
        ),
        title: Text(
          title,
          style: TextStyle(
            color: textPrimary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
        ),
        trailing: trailing != null
            ? Text(trailing, style: TextStyle(color: textSecondary, fontSize: 13))
            : Icon(Icons.chevron_right, color: textSecondary.withOpacity(0.5)),
        onTap: onTap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }
}
