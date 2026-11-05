Pod::Spec.new do |s|
  s.name           = 'VoicsCrypto'
  s.version        = '0.1.0'
  s.summary        = 'Voics native crypto: OpenMLS groups, device identity and the encrypted local store'
  s.description    = 'Swift wrapper (Expo module) over the Rust engine in native/crypto, built as an XCFramework.'
  s.author         = 'Voics'
  s.homepage       = 'https://voics.nl'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Both folders come from the crypto-ios workflow artifact (see .gitignore here). `pod install` fails
  # with a missing-file error when they are absent, which is the intended loud failure.
  s.vendored_frameworks = 'Frameworks/VoicsCryptoFFI.xcframework'
  s.source_files        = '*.swift', 'Generated/*.swift'
  s.preserve_paths      = 'Generated/*'

  # The generated Swift imports the C module voics_cryptoFFI; Generated/module.modulemap defines it.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/Generated"',
  }
  # The app target imports this pod's Swift module, which needs the C module too.
  s.user_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "${PODS_ROOT}/../../modules/voics-crypto/ios/Generated"',
  }
end
