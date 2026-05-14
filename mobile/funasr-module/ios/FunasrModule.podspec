Pod::Spec.new do |s|
  s.name = "FunasrModule"
  s.version = "0.1.0"
  s.summary = "Expo native module for FunASR-Nano-2512 on-device speech-to-text"
  s.homepage = "https://github.com/reflector"
  s.license = "MIT"
  s.authors = "Reflector"
  s.source = { :git => "" }
  s.ios.deployment_target = "15.0"
  s.swift_version = "5.4"

  s.source_files = "**/*.{swift,h,mm}"

  # ONNX Runtime dependency (via CocoaPods)
  # s.dependency "onnxruntime-cpp", "~> 1.20"

  s.dependency "ExpoModulesCore"
  s.pod_target_xcconfig = {
    'SWIFT_OBJC_BRIDGING_HEADER' => '$(PODS_TARGET_SRCROOT)/FunasrModule-Bridging-Header.h'
  }
end