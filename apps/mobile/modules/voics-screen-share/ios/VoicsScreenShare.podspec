Pod::Spec.new do |s|
  s.name = 'VoicsScreenShare'
  s.version = '0.1.0'
  s.summary = 'ReplayKit consent and broadcast lifecycle for Voics'
  s.author = 'Voics'
  s.homepage = 'https://voics.nl'
  s.license = { :type => 'UNLICENSED' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ReplayKit', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
end
