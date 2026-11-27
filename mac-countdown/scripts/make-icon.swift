// Draws the Countdown app icon (1024×1024 PNG): the eclipse countdown face with "CDT".
// Usage: swift scripts/make-icon.swift <output.png>
import AppKit

let canvas: CGFloat = 1024
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon-1024.png"

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
    let graphics = NSGraphicsContext(bitmapImageRep: rep)
else { fatalError("Could not create the drawing surface") }

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphics
let cg = graphics.cgContext  // origin bottom-left, y up

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: r, green: g, blue: b, alpha: a)
}

func radial(_ stops: [(CGFloat, CGColor)], at center: CGPoint, radius: CGFloat) {
    let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
                              colors: stops.map { $0.1 } as CFArray,
                              locations: stops.map { $0.0 })!
    cg.drawRadialGradient(gradient, startCenter: center, startRadius: 0,
                          endCenter: center, endRadius: radius, options: [])
}

// MARK: Tile (macOS icon grid: 824pt body inside a 1024 canvas)

let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let tilePath = CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)

cg.saveGState()
cg.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: rgb(0, 0, 0, 0.5))
cg.addPath(tilePath)
cg.setFillColor(rgb(0.02, 0.03, 0.07))
cg.fillPath()
cg.restoreGState()

cg.saveGState()
cg.addPath(tilePath)
cg.clip()

let background = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
                            colors: [rgb(0.06, 0.09, 0.18), rgb(0.01, 0.015, 0.04)] as CFArray,
                            locations: [0, 1])!
cg.drawLinearGradient(background, start: CGPoint(x: 512, y: tile.maxY),
                      end: CGPoint(x: 512, y: tile.minY), options: [])

// MARK: Eclipse

let center = CGPoint(x: 512, y: 512)
let radius: CGFloat = 232
let lit = CGPoint(x: center.x, y: center.y + radius * 0.10)  // brighter towards the top

let ice = rgb(0.86, 0.95, 1.0)
let cyan = (r: CGFloat(0.42), g: CGFloat(0.80), b: CGFloat(1.0))
let deepBlue = (r: CGFloat(0.12), g: CGFloat(0.38), b: CGFloat(0.95))

cg.setBlendMode(.plusLighter)

// Outer corona (deep blue).
radial([(0.42, rgb(deepBlue.r, deepBlue.g, deepBlue.b, 0)),
        (0.60, rgb(deepBlue.r, deepBlue.g, deepBlue.b, 0.62)),
        (0.80, rgb(deepBlue.r, deepBlue.g, deepBlue.b, 0.22)),
        (1.00, rgb(deepBlue.r, deepBlue.g, deepBlue.b, 0))],
       at: lit, radius: radius * 1.9)

// Uneven flares, so the glow isn't the same all the way round.
for (angle, reach, size, alpha) in [(CGFloat.pi * 0.80, 1.18, 0.62, 0.34),   // upper left
                                    (CGFloat.pi * 1.85, 1.22, 0.55, 0.26),   // lower right
                                    (CGFloat.pi * 0.25, 1.15, 0.45, 0.20)] { // upper right
    let p = CGPoint(x: center.x + cos(angle) * radius * reach, y: center.y + sin(angle) * radius * reach)
    radial([(0, rgb(cyan.r, cyan.g, cyan.b, alpha)), (1, rgb(cyan.r, cyan.g, cyan.b, 0))],
           at: p, radius: radius * size)
}

// Inner corona hugging the rim (ice white into cyan).
radial([(0.55, rgb(cyan.r, cyan.g, cyan.b, 0)),
        (0.68, rgb(0.86, 0.95, 1.0, 0.85)),
        (0.78, rgb(cyan.r, cyan.g, cyan.b, 0.6)),
        (1.00, rgb(cyan.r, cyan.g, cyan.b, 0))],
       at: lit, radius: radius * 1.45)

// The black disc.
cg.setBlendMode(.normal)
cg.saveGState()
cg.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
cg.clip()
radial([(0, rgb(0, 0, 0)), (0.8, rgb(0.01, 0.01, 0.01)), (1, rgb(0.07, 0.05, 0.04))],
       at: center, radius: radius)
cg.restoreGState()

// Rim: faint all the way round, bright for "time remaining" (clockwise from 12).
let top = CGFloat.pi / 2
let shown: CGFloat = 0.68
let end = top - shown * 2 * .pi

cg.setLineCap(.round)
cg.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
cg.setStrokeColor(rgb(0.86, 0.95, 1.0, 0.22))
cg.setLineWidth(3)
cg.strokePath()

cg.setBlendMode(.plusLighter)
cg.addArc(center: center, radius: radius, startAngle: top, endAngle: end, clockwise: true)
cg.setStrokeColor(rgb(cyan.r, cyan.g, cyan.b, 0.28))
cg.setLineWidth(24)
cg.strokePath()

cg.setBlendMode(.normal)
cg.addArc(center: center, radius: radius, startAngle: top, endAngle: end, clockwise: true)
cg.setStrokeColor(ice)
cg.setLineWidth(5)
cg.strokePath()

cg.addArc(center: center, radius: radius * 0.975, startAngle: top, endAngle: end, clockwise: true)
cg.setStrokeColor(rgb(0.86, 0.95, 1.0, 0.4))
cg.setLineWidth(1.5)
cg.strokePath()

// Spark at the leading edge.
let spark = CGPoint(x: center.x + cos(end) * radius, y: center.y + sin(end) * radius)
cg.setBlendMode(.plusLighter)
radial([(0, rgb(0.95, 0.99, 1.0, 0.95)), (0.35, rgb(cyan.r, cyan.g, cyan.b, 0.55)),
        (1, rgb(cyan.r, cyan.g, cyan.b, 0))],
       at: spark, radius: 46)
cg.setBlendMode(.normal)
cg.setFillColor(rgb(1, 1, 1))
cg.fillEllipse(in: CGRect(x: spark.x - 6, y: spark.y - 6, width: 12, height: 12))

// Small ▾ marker at 12 o'clock, just inside the rim.
let markerY = center.y + radius - 30
cg.move(to: CGPoint(x: center.x - 9, y: markerY + 7))
cg.addLine(to: CGPoint(x: center.x + 9, y: markerY + 7))
cg.addLine(to: CGPoint(x: center.x, y: markerY - 8))
cg.closePath()
cg.setFillColor(rgb(1, 1, 1, 0.6))
cg.fillPath()

// MARK: "CDT" in the countdown's thin typeface

let shadow = NSShadow()
shadow.shadowColor = NSColor(srgbRed: cyan.r, green: cyan.g, blue: cyan.b, alpha: 0.55)
shadow.shadowBlurRadius = 18
shadow.shadowOffset = .zero

let text = NSAttributedString(string: "CDT", attributes: [
    .font: NSFont.systemFont(ofSize: 150, weight: .thin),
    .foregroundColor: NSColor.white,
    .kern: 10,
    .shadow: shadow,
])
let textSize = text.size()
// Nudge right by half the trailing kern so the letters sit visually centred.
text.draw(at: CGPoint(x: center.x - textSize.width / 2 + 5, y: center.y - textSize.height / 2 + 4))

cg.restoreGState()  // tile clip
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { fatalError("PNG encoding failed") }
do {
    try png.write(to: URL(fileURLWithPath: output))
    print("Wrote \(output)")
} catch {
    fatalError("Could not write \(output): \(error)")
}
