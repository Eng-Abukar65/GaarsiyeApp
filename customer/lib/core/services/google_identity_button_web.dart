import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:google_identity_services_web/id.dart' as gis;
import 'package:google_identity_services_web/loader.dart' as loader;
import 'package:web/web.dart' as web;

class GoogleIdentityButton extends StatefulWidget {
  const GoogleIdentityButton({
    super.key,
    required this.clientId,
    required this.onIdToken,
    required this.onError,
    this.buttonWidth = 400,
    this.isDark = false,
  });

  final String clientId;
  final ValueChanged<String> onIdToken;
  final ValueChanged<Object> onError;
  final double buttonWidth;
  final bool isDark;

  @override
  State<GoogleIdentityButton> createState() => _GoogleIdentityButtonState();
}

class _GoogleIdentityButtonState extends State<GoogleIdentityButton> {
  late final String _viewType =
      'delivery_google_identity_button_${DateTime.now().microsecondsSinceEpoch}';
  web.Element? _buttonRoot;
  gis.CallbackFn? _credentialCallback;
  bool _sdkReady = false;
  double? _lastRenderedWidth;

  @override
  void initState() {
    super.initState();
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
      final web.Element element = web.document.createElement('div');
      element.id = '${_viewType}_$viewId';
      element.setAttribute(
        'style',
        'width:100%;height:100%;display:flex;align-items:center;'
            'justify-content:center;overflow:hidden;',
      );
      return element;
    });
    _initialize();
  }

  @override
  void didUpdateWidget(covariant GoogleIdentityButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.clientId != widget.clientId) {
      _sdkReady = false;
      _lastRenderedWidth = null;
      _initialize();
    } else if (oldWidget.isDark != widget.isDark ||
        oldWidget.buttonWidth != widget.buttonWidth) {
      _lastRenderedWidth = null;
      _renderButton(widget.buttonWidth);
    }
  }

  Future<void> _initialize() async {
    try {
      final clientId = widget.clientId.trim();
      if (clientId.isEmpty) {
        throw Exception('Google sign-in needs a valid OAuth Client ID.');
      }

      await loader.loadWebSdk();
      if (!mounted) return;

      _credentialCallback = _handleCredential;
      gis.id.initialize(
        gis.IdConfiguration(
          client_id: clientId,
          callback: _credentialCallback,
          cancel_on_tap_outside: false,
          ux_mode: gis.UxMode.popup,
          use_fedcm_for_prompt: true,
        ),
      );

      _sdkReady = true;
      _renderButton(widget.buttonWidth);
    } catch (error) {
      widget.onError(error);
    }
  }

  void _handleCredential(gis.CredentialResponse response) {
    final error = response.error ?? response.error_detail;
    if (error != null && error.isNotEmpty) {
      widget.onError(Exception(error));
      return;
    }

    final idToken = response.credential;
    if (idToken == null || idToken.isEmpty) {
      widget.onError(Exception('Google did not return an ID token.'));
      return;
    }

    widget.onIdToken(idToken);
  }

  void _renderButton(double width) {
    final root = _buttonRoot;
    if (!_sdkReady || root == null || _lastRenderedWidth == width) {
      return;
    }

    root.textContent = '';
    gis.id.renderButton(
      root,
      gis.GsiButtonConfiguration(
        type: gis.ButtonType.standard,
        theme: widget.isDark
            ? gis.ButtonTheme.filled_black
            : gis.ButtonTheme.outline,
        size: gis.ButtonSize.large,
        text: gis.ButtonText.continue_with,
        shape: gis.ButtonShape.rectangular,
        logo_alignment: gis.ButtonLogoAlignment.left,
        width: width,
      ),
    );
    _lastRenderedWidth = width;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final targetWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth.clamp(200.0, 400.0).toDouble()
            : widget.buttonWidth;

        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _renderButton(targetWidth);
        });

        return SizedBox(
          width: double.infinity,
          height: 56,
          child: HtmlElementView(
            viewType: _viewType,
            onPlatformViewCreated: (int viewId) {
              _buttonRoot =
                  ui_web.platformViewRegistry.getViewById(viewId)
                      as web.Element;
              _renderButton(targetWidth);
            },
          ),
        );
      },
    );
  }
}
