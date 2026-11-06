Pod::Spec.new do |s|
  s.name           = 'VoicsCallKit'
  s.version        = '0.1.0'
  s.summary        = 'Voics native call UI: CallKit and PushKit (VoIP push)'
  s.description    = 'Expo module that reports calls to CallKit, receives PushKit VoIP pushes and reports them to CallKit at once, as Apple requires.'
  s.author         = 'Voics'
  s.homepage       = 'https://voics.nl'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
end
