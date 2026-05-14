cmake_minimum_required(VERSION 3.22)

project("funasr_fbank")

add_library(funasr_fbank SHARED
    src/main/jni/fbank_jni.cpp
)

target_include_directories(funasr_fbank PRIVATE
    src/main/jni
)

target_link_libraries(funasr_fbank
    log
)

# In production, also build and link ONNX Runtime:
# add_subdirectory(onnxruntime)
# target_link_libraries(funasr_fbank onnxruntime)