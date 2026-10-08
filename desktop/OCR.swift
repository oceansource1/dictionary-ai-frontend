import Foundation
import ImageIO
import Vision

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value) {
        FileHandle.standardOutput.write(data)
    }
}
do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard input.count <= 24 * 1024 * 1024,
        let json = try JSONSerialization.jsonObject(with: input) as? [String: Any],
        let encoded = json["image"] as? String,
        let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= 20 * 1024 * 1024,
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? Int,
        let height = properties[kCGImagePropertyPixelHeight] as? Int,
        width > 0, height > 0, Double(width) * Double(height) <= 32_000_000,
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
        throw NSError(
            domain: "LocalLensOCR", code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: "无法读取图片，请使用清晰的 PNG、JPEG 或 WebP 截图（不超过 20 MB / 3200 万像素）。"
            ])
    }
    let orientation =
        CGImagePropertyOrientation(
            rawValue: (properties[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1)
        ?? .up
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages =
        json["language"] as? String == "zh"
        ? ["zh-Hans", "zh-Hant", "en-US"] : ["en-US", "zh-Hans"]
    request.revision = VNRecognizeTextRequestRevision3
    try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([
        request
    ])
    let lines = (request.results ?? []).compactMap { observation -> [String: Any]? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return ["text": candidate.string, "confidence": candidate.confidence]
    }
    var text = ""
    var previous: CGRect?
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        if let last = previous {
            let lineHeight = max(last.height, box.height)
            let paragraphGap = last.minY - box.maxY > lineHeight * 0.8
            let nextColumn = box.midY > last.midY + lineHeight
            text +=
                paragraphGap || nextColumn
                ? "\n\n" : (json["language"] as? String == "zh" ? "" : " ")
        }
        text += candidate.string
        previous = box
    }
    emit(["text": text, "lines": lines, "engine": "Apple Vision · 本地 OCR"])
} catch {
    emit(["error": error.localizedDescription])
    exit(1)
}
