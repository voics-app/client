Pod::Spec.new do |s|
  s.name = 'VoicsRecorder'
  s.version = '1.0.0'
  s.summary = 'Voics voice-message recorder'
  s.description = 'Native Opus recording for voice messages.'
  s.author = 'Voics'
  s.homepage = 'https://voics.nl'
  s.license = { :type => 'UNLICENSED' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
