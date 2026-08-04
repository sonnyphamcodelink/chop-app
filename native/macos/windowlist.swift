import CoreGraphics
import Foundation

// Front-to-back, on-screen, excluding desktop icons and wallpaper.
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]

guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("window list unavailable\n".data(using: .utf8)!)
    exit(1)
}

var out: [[String: Any]] = []

for window in raw {
    // Layer 0 is the normal application window layer. Anything else is a menu,
    // dock, status item, or system overlay, none of which are capture targets.
    guard let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          let id = window[kCGWindowNumber as String] as? Int else { continue }

    let alpha = (window[kCGWindowAlpha as String] as? Double) ?? 1
    if alpha < 0.05 { continue }

    let width = (bounds["Width"] as? Double) ?? 0
    let height = (bounds["Height"] as? Double) ?? 0

    out.append([
        "id": id,
        "x": (bounds["X"] as? Double) ?? 0,
        "y": (bounds["Y"] as? Double) ?? 0,
        "width": width,
        "height": height,
        "app": (window[kCGWindowOwnerName as String] as? String) ?? "",
    ])
}

let data = try JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
