package com.example.deliveryapp

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "deliveryapp/phone"
        ).setMethodCallHandler { call, result ->
            if (call.method != "openDialer") {
                result.notImplemented()
                return@setMethodCallHandler
            }

            val phone = call.argument<String>("phone")
                ?.trim()
                ?.filter { it.isDigit() || it == '+' }

            if (phone.isNullOrEmpty()) {
                result.error("INVALID_PHONE", "Driver phone number is unavailable.", null)
                return@setMethodCallHandler
            }

            try {
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                result.success(null)
            } catch (error: Exception) {
                result.error("DIALER_UNAVAILABLE", error.message, null)
            }
        }
    }
}
