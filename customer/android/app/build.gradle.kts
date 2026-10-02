import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing material is read from android/key.properties, which is
// git-ignored and never committed. See android/key.properties.example for the
// expected keys and the keytool command that generates the keystore.
//
// When the file is absent the release build falls back to the debug keystore so
// `flutter build apk --release` still produces an installable APK for testing —
// but such an APK cannot be uploaded to Google Play. The build log says which
// key was used, so an unsigned-for-production build is never a silent surprise.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseKeystore =
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
        val storeFilePath = keystoreProperties.getProperty("storeFile")
        val resolved = storeFilePath != null && rootProject.file(storeFilePath).exists()
        if (!resolved) {
            logger.warn("key.properties found but storeFile '$storeFilePath' does not exist — falling back to debug signing.")
        }
        resolved
    } else {
        false
    }

android {
    namespace = "com.example.deliveryapp"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Play Store rejects `com.example.*`. This is the published identity of
        // the app and must not change once it has been uploaded.
        applicationId = "com.gaarsis.deliveryapp"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Inject environment variables into AndroidManifest
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = System.getenv("GOOGLE_MAPS_API_KEY") ?: ""
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (hasReleaseKeystore) {
                    signingConfigs.getByName("release")
                } else {
                    logger.lifecycle(
                        "⚠  android/key.properties not found — signing the release build with the DEBUG key. " +
                            "The APK installs and runs, but cannot be published to Google Play. " +
                            "See android/key.properties.example."
                    )
                    signingConfigs.getByName("debug")
                }

            // Left off deliberately. R8 strips classes that Firebase, geolocator
            // and socket_io_client reach reflectively, and the resulting crashes
            // only appear at runtime on a device. Turn these on together with a
            // full pass through the app on real hardware, not as a build tweak.
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

flutter {
    source = "../.."
}
